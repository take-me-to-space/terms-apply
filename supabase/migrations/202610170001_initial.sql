-- Apply through Supabase migrations/SQL editor, never from the browser.
create table public.preferences (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  reminders_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.commitments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  goal text not null check (length(goal) between 3 and 180),
  done_means text not null check (length(done_means) between 3 and 700),
  deadline_at timestamptz not null,
  pledge text not null check (length(pledge) between 3 and 700),
  pledge_check_at timestamptz not null check (pledge_check_at > deadline_at),
  timezone text not null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz not null default now()
);
create index commitments_owner on public.commitments(user_id, confirmed_at desc);

create table public.goal_reports (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null unique references public.commitments(id) on delete cascade,
  outcome text not null check (outcome in ('on_time', 'late', 'missed')),
  completed_at timestamptz,
  reported_at timestamptz not null default now(),
  note text check (length(note) <= 1200),
  check ((outcome = 'missed' and completed_at is null) or (outcome <> 'missed' and completed_at is not null))
);
create table public.pledge_reports (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references public.commitments(id) on delete cascade,
  outcome text not null check (outcome in ('honoured', 'not_honoured', 'not_yet')),
  reported_at timestamptz not null default now(),
  note text check (length(note) <= 1200)
);
create index pledge_reports_commitment on public.pledge_reports(commitment_id, reported_at);
create unique index one_final_pledge_report on public.pledge_reports(commitment_id) where outcome <> 'not_yet';
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null unique references public.commitments(id) on delete cascade,
  withdrawn_at timestamptz not null default now(),
  reason text check (length(reason) <= 1200)
);

create table public.reminder_jobs (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid not null references public.commitments(id) on delete cascade,
  kind text not null check (kind in ('before_deadline', 'goal_checkin', 'pledge_checkin')),
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'cancelled', 'failed')),
  attempts integer not null default 0,
  first_attempt_at timestamptz,
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  lease_token uuid,
  sent_at timestamptz,
  provider_id text,
  last_error text,
  unique(commitment_id, kind)
);
create index reminder_jobs_due on public.reminder_jobs(available_at, due_at) where status in ('pending', 'processing');

alter table public.preferences enable row level security;
alter table public.commitments enable row level security;
alter table public.goal_reports enable row level security;
alter table public.pledge_reports enable row level security;
alter table public.withdrawals enable row level security;
alter table public.reminder_jobs enable row level security;
create policy own_preferences on public.preferences for select to authenticated using (user_id = auth.uid());
create policy own_commitments on public.commitments for select to authenticated using (user_id = auth.uid());
create policy own_goal_reports on public.goal_reports for select to authenticated using (exists(select 1 from public.commitments c where c.id = commitment_id and c.user_id = auth.uid()));
create policy own_pledge_reports on public.pledge_reports for select to authenticated using (exists(select 1 from public.commitments c where c.id = commitment_id and c.user_id = auth.uid()));
create policy own_withdrawals on public.withdrawals for select to authenticated using (exists(select 1 from public.commitments c where c.id = commitment_id and c.user_id = auth.uid()));
revoke all on public.preferences, public.commitments, public.goal_reports, public.pledge_reports, public.withdrawals, public.reminder_jobs from anon, authenticated;
grant select on public.preferences, public.commitments, public.goal_reports, public.pledge_reports, public.withdrawals to authenticated;
grant all on public.preferences, public.commitments, public.goal_reports, public.pledge_reports, public.withdrawals, public.reminder_jobs to service_role;

create function public.set_reminders(p_enabled boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if p_enabled is null then raise exception 'Choose a reminder preference'; end if;
  insert into public.preferences(user_id, reminders_enabled) values(auth.uid(), p_enabled)
  on conflict(user_id) do update set reminders_enabled = excluded.reminders_enabled, updated_at = now();
end; $$;

create function public.create_commitment(p_goal text, p_done_means text, p_deadline_at timestamptz, p_pledge text, p_pledge_check_at timestamptz, p_timezone text, p_request_id uuid default gen_random_uuid()) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; existing public.commitments;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  -- Serialise retries of one confirmation, including concurrent requests.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into existing from public.commitments where id = p_request_id;
  if found then
    if existing.user_id = auth.uid() and existing.goal = trim(p_goal) and existing.done_means = trim(p_done_means)
      and existing.deadline_at = p_deadline_at and existing.pledge = trim(p_pledge)
      and existing.pledge_check_at = p_pledge_check_at and existing.timezone = p_timezone then return existing.id;
    end if;
    raise exception 'This confirmation has already been used with different terms';
  end if;
  if p_deadline_at is null or not isfinite(p_deadline_at) or p_deadline_at <= now() then raise exception 'Choose a future deadline'; end if;
  if p_pledge_check_at is null or not isfinite(p_pledge_check_at) or p_pledge_check_at <= p_deadline_at then raise exception 'Pledge check-in must be after the goal deadline'; end if;
  if not exists(select 1 from pg_timezone_names where name = p_timezone) then raise exception 'Unknown timezone'; end if;
  insert into public.commitments(id, goal, done_means, deadline_at, pledge, pledge_check_at, timezone)
  values(p_request_id, trim(p_goal), trim(p_done_means), p_deadline_at, trim(p_pledge), p_pledge_check_at, p_timezone) returning id into v_id;
  if p_deadline_at - interval '2 hours' > now() then
    insert into public.reminder_jobs(commitment_id, kind, due_at) values(v_id, 'before_deadline', p_deadline_at - interval '2 hours');
  end if;
  insert into public.reminder_jobs(commitment_id, kind, due_at) values(v_id, 'goal_checkin', p_deadline_at);
  return v_id;
end; $$;

create function public.report_goal(p_commitment_id uuid, p_outcome text, p_completed_at timestamptz default null, p_note text default null) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.commitments; v_outcome text;
begin
  select * into c from public.commitments where id = p_commitment_id and user_id = auth.uid() for update;
  if not found then raise exception 'Commitment not found'; end if;
  if exists(select 1 from public.withdrawals where commitment_id = c.id) then raise exception 'This commitment was withdrawn'; end if;
  if exists(select 1 from public.goal_reports where commitment_id = c.id) then raise exception 'A goal report is already recorded'; end if;
  if p_outcome = 'missed' then
    if now() <= c.deadline_at then raise exception 'The deadline has not passed yet'; end if;
    if p_completed_at is not null then raise exception 'A missed goal cannot have a completion time'; end if;
    v_outcome := 'missed';
  elsif p_outcome = 'completed' then
    if p_completed_at is null or p_completed_at > now() or p_completed_at < c.confirmed_at then
      raise exception 'Choose a completion time between confirmation and now';
    end if;
    v_outcome := case when p_completed_at <= c.deadline_at then 'on_time' else 'late' end;
  else raise exception 'Choose completed or missed'; end if;
  insert into public.goal_reports(commitment_id, outcome, completed_at, note) values(c.id, v_outcome, p_completed_at, nullif(trim(p_note), ''));
  update public.reminder_jobs set status = 'cancelled' where commitment_id = c.id and kind <> 'pledge_checkin' and status in ('pending', 'processing');
  if v_outcome in ('late', 'missed') then
    insert into public.reminder_jobs(commitment_id, kind, due_at) values(c.id, 'pledge_checkin', greatest(c.pledge_check_at, now()));
  end if;
  return v_outcome;
end; $$;

create function public.report_pledge(p_commitment_id uuid, p_outcome text, p_note text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.commitments;
begin
  select * into c from public.commitments where id = p_commitment_id and user_id = auth.uid() for update;
  if not found then raise exception 'Commitment not found'; end if;
  if not exists(select 1 from public.goal_reports where commitment_id = c.id and outcome in ('late', 'missed')) then raise exception 'No pledge is due for this goal'; end if;
  if p_outcome is null or p_outcome not in ('honoured', 'not_honoured', 'not_yet') then raise exception 'Choose a pledge outcome'; end if;
  if exists(select 1 from public.pledge_reports where commitment_id = c.id and outcome <> 'not_yet') then raise exception 'A final pledge report is already recorded'; end if;
  if p_outcome <> 'not_yet' and now() < c.pledge_check_at then raise exception 'Your pledge check-in time has not arrived'; end if;
  if exists(select 1 from public.pledge_reports where commitment_id = c.id and reported_at > now() - interval '1 minute') then raise exception 'Your last answer was just saved. Try again in a minute'; end if;
  insert into public.pledge_reports(commitment_id, outcome, note) values(c.id, p_outcome, nullif(trim(p_note), ''));
  if p_outcome <> 'not_yet' or now() >= c.pledge_check_at then
    update public.reminder_jobs set status = 'cancelled' where commitment_id = c.id and kind = 'pledge_checkin' and status in ('pending', 'processing');
  end if;
end; $$;

create function public.withdraw_commitment(p_commitment_id uuid, p_reason text default null) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare c public.commitments;
begin
  select * into c from public.commitments where id = p_commitment_id and user_id = auth.uid() for update;
  if not found then raise exception 'Commitment not found'; end if;
  if exists(select 1 from public.goal_reports where commitment_id = c.id) then raise exception 'A reported goal cannot be withdrawn'; end if;
  if exists(select 1 from public.withdrawals where commitment_id = c.id) then raise exception 'Already withdrawn'; end if;
  insert into public.withdrawals(commitment_id, reason) values(c.id, nullif(trim(p_reason), ''));
  update public.reminder_jobs set status = 'cancelled' where commitment_id = c.id and status in ('pending', 'processing');
end; $$;

-- Owner-only reminder functions. No browser grants; no email addresses in public views.
create function public.reminder_is_eligible(p_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select
    p.reminders_enabled and u.email_confirmed_at is not null and u.email is not null
    and not exists(select 1 from public.withdrawals w where w.commitment_id = c.id)
    and case j.kind
      when 'before_deadline' then now() < c.deadline_at and not exists(select 1 from public.goal_reports g where g.commitment_id = c.id)
      when 'goal_checkin' then not exists(select 1 from public.goal_reports g where g.commitment_id = c.id)
      when 'pledge_checkin' then exists(select 1 from public.goal_reports g where g.commitment_id = c.id and g.outcome in ('late','missed'))
        and not exists(select 1 from public.pledge_reports r where r.commitment_id = c.id and (r.outcome <> 'not_yet' or r.reported_at >= c.pledge_check_at))
      else false end
    from public.reminder_jobs j join public.commitments c on c.id = j.commitment_id
    join auth.users u on u.id = c.user_id join public.preferences p on p.user_id = c.user_id
    where j.id = p_id), false);
$$;

create function public.claim_reminders(p_limit integer default 20)
returns table(job_id uuid, lease_token uuid)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.reminder_jobs j set status = 'failed', last_error = 'Retry window or maximum attempts exhausted; inspect provider before manual retry'
    where j.status in ('pending','processing') and (j.attempts >= 4 or j.first_attempt_at < now() - interval '23 hours')
      and (j.locked_until is null or j.locked_until < now());
  return query
    with candidates as (
      select j.id from public.reminder_jobs j where j.status in ('pending','processing')
      and j.due_at <= now() and j.available_at <= now() and (j.locked_until is null or j.locked_until < now())
      and j.attempts < 4 order by j.due_at for update skip locked limit least(greatest(p_limit,1),50)
    )
    update public.reminder_jobs j set status = 'processing', attempts = j.attempts + 1,
      first_attempt_at = coalesce(j.first_attempt_at, now()), locked_until = now() + interval '10 minutes', lease_token = gen_random_uuid()
    from candidates where j.id = candidates.id returning j.id, j.lease_token;
end; $$;

create function public.get_reminder_delivery(p_job_id uuid, p_lease_token uuid)
returns table(job_id uuid, kind text, recipient text, commitment_id uuid, deadline_at timestamptz, pledge_check_at timestamptz, timezone text)
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.reminder_is_eligible(p_job_id) then
    update public.reminder_jobs set status = 'cancelled' where id = p_job_id and lease_token = p_lease_token and status = 'processing';
    return;
  end if;
  return query select j.id, j.kind, u.email::text, c.id, c.deadline_at, c.pledge_check_at, c.timezone
    from public.reminder_jobs j join public.commitments c on c.id = j.commitment_id join auth.users u on u.id = c.user_id
    where j.id = p_job_id and j.lease_token = p_lease_token and j.status = 'processing' and j.locked_until > now();
end; $$;

create function public.finish_reminder(p_job_id uuid, p_lease_token uuid, p_provider_id text default null, p_error text default null, p_permanent boolean default false) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.reminder_jobs set
    status = case when p_provider_id is not null then 'sent' when p_permanent or attempts >= 4 then 'failed' else 'pending' end,
    provider_id = p_provider_id, last_error = left(p_error, 300),
    sent_at = case when p_provider_id is not null then now() else null end,
    available_at = now() + interval '15 minutes', locked_until = null
    where id = p_job_id and lease_token = p_lease_token and status = 'processing';
end; $$;

-- A signed-in user may delete only their own account. Cascades remove app data/jobs.
create function public.delete_my_account() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from auth.users where id = auth.uid();
end; $$;

-- Postgres functions otherwise default to PUBLIC execute. Explicitly close every RPC.
revoke all on function public.set_reminders(boolean), public.create_commitment(text,text,timestamptz,text,timestamptz,text,uuid), public.report_goal(uuid,text,timestamptz,text), public.report_pledge(uuid,text,text), public.withdraw_commitment(uuid,text), public.delete_my_account() from public, anon;
grant execute on function public.set_reminders(boolean), public.create_commitment(text,text,timestamptz,text,timestamptz,text,uuid), public.report_goal(uuid,text,timestamptz,text), public.report_pledge(uuid,text,text), public.withdraw_commitment(uuid,text), public.delete_my_account() to authenticated;
revoke all on function public.reminder_is_eligible(uuid), public.claim_reminders(integer), public.get_reminder_delivery(uuid,uuid), public.finish_reminder(uuid,uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function public.reminder_is_eligible(uuid), public.claim_reminders(integer), public.get_reminder_delivery(uuid,uuid), public.finish_reminder(uuid,uuid,text,text,boolean) to service_role;
