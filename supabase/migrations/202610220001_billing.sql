-- Opt-in rollout. This migration alone does not turn on a paywall or charging.
create table public.billing_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  environment text not null default 'test_mode' check (environment in ('test_mode','live_mode')),
  product_id text not null default 'pdt_0NqIIp0MtDK9rLdhZdqff',
  started_at timestamptz not null default now()
);
insert into public.billing_config(singleton) values(true);
create table public.billing_test_users (user_id uuid primary key references auth.users on delete cascade);
create table public.billing_customers (
  user_id uuid not null references auth.users on delete cascade,
  environment text not null check (environment in ('test_mode','live_mode')),
  customer_id text,
  checkout_request uuid not null default gen_random_uuid(),
  checkout_created_at timestamptz not null default now(),
  checkout_lease_until timestamptz,
  checkout_id text,
  checkout_url text,
  checkout_state text not null default 'creating' check (checkout_state in ('creating','open','complete')),
  deleting boolean not null default false,
  synced_at timestamptz,
  sync_error text,
  primary key(user_id, environment), unique(environment,customer_id)
);
create table public.billing_subscriptions (
  environment text not null,
  subscription_id text not null,
  user_id uuid not null,
  product_id text not null,
  status text not null,
  cancel_at_period_end boolean not null,
  next_billing_at timestamptz,
  observed_at timestamptz not null,
  primary key(environment,subscription_id),
  foreign key(user_id,environment) references public.billing_customers on delete cascade
);
create table public.billing_receipts (
  environment text not null,
  payment_id text not null,
  subscription_id text not null,
  user_id uuid not null,
  product_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  valid boolean not null,
  observed_at timestamptz not null,
  primary key(environment,payment_id,subscription_id),
  foreign key(user_id,environment) references public.billing_customers on delete cascade
);
create table public.billing_events (
  environment text not null,
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts integer not null default 0,
  error_code text,
  primary key(environment,event_id)
);
create index billing_receipts_access on public.billing_receipts(user_id,environment,product_id,ends_at) where valid;
create index billing_subscriptions_owner on public.billing_subscriptions(user_id,environment);
create index billing_customers_sync on public.billing_customers(environment,synced_at);

-- No browser table access, including provider URLs and event payloads. No raw webhook bodies stored.
alter table public.billing_config enable row level security;
alter table public.billing_test_users enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_receipts enable row level security;
alter table public.billing_events enable row level security;
revoke all on public.billing_config, public.billing_test_users, public.billing_customers, public.billing_subscriptions, public.billing_receipts, public.billing_events from public, anon, authenticated;
grant all on public.billing_config, public.billing_test_users, public.billing_customers, public.billing_subscriptions, public.billing_receipts, public.billing_events to service_role;

create function public.get_billing_state() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare c public.billing_config; v_enabled boolean; v_until timestamptz; v_used integer; v_reset timestamptz;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into strict c from public.billing_config;
  v_enabled := c.enabled and (c.environment = 'live_mode' or exists(select 1 from public.billing_test_users where user_id=auth.uid()));
  v_reset := (date_trunc('month', now() at time zone 'UTC') + interval '1 month') at time zone 'UTC';
  select count(*) into v_used from public.commitments where user_id=auth.uid()
    and confirmed_at >= greatest(c.started_at, date_trunc('month', now() at time zone 'UTC') at time zone 'UTC');
  select max(ends_at) into v_until from public.billing_receipts where user_id=auth.uid()
    and environment=c.environment and product_id=c.product_id and valid and starts_at<=now() and ends_at>now();
  return jsonb_build_object('enabled',v_enabled,'test_mode',c.environment='test_mode',
    'paid',v_until is not null,'paid_until',v_until,'used',v_used,'limit',3,'resets_at',v_reset,
    'has_customer',exists(select 1 from public.billing_customers where user_id=auth.uid() and environment=c.environment and customer_id is not null),
    'renewing',exists(select 1 from public.billing_subscriptions where user_id=auth.uid() and environment=c.environment
       and status not in ('cancelled','expired') and not cancel_at_period_end),
    'cancelling',exists(select 1 from public.billing_subscriptions where user_id=auth.uid() and environment=c.environment
       and status not in ('cancelled','expired') and cancel_at_period_end),
    'payment_issue',exists(select 1 from public.billing_subscriptions where user_id=auth.uid() and environment=c.environment and status in ('past_due','on_hold','failed')));
end; $$;
revoke all on function public.get_billing_state() from public, anon;
grant execute on function public.get_billing_state() to authenticated;

-- Reserve an immutable checkout request before calling the provider. Retries reuse its idempotency key.
create function public.reserve_billing_checkout(p_user_id uuid,p_environment text) returns public.billing_customers
language plpgsql security definer set search_path=public,pg_temp as $$
declare c public.billing_config; r public.billing_customers;
begin
  perform pg_advisory_xact_lock(hashtextextended('billing:' || p_user_id::text,0));
  select * into strict c from public.billing_config;
  if not c.enabled or c.environment<>p_environment or (c.environment='test_mode' and not exists(select 1 from public.billing_test_users where user_id=p_user_id)) then
    raise exception 'Billing is not available for this account'; end if;
  if exists(select 1 from public.billing_subscriptions where user_id=p_user_id and environment=p_environment and status not in ('cancelled','expired')) then
    raise exception 'An existing subscription needs attention. Manage billing in Account.'; end if;
  if exists(select 1 from public.billing_receipts where user_id=p_user_id and environment=p_environment and product_id=c.product_id and valid and starts_at<=now() and ends_at>now()) then
    raise exception 'Plus is already available on this account'; end if;
  insert into public.billing_customers(user_id,environment) values(p_user_id,p_environment) on conflict do nothing;
  select * into strict r from public.billing_customers where user_id=p_user_id and environment=p_environment for update;
  if r.deleting then raise exception 'Account deletion is in progress. Contact support before starting another checkout.'; end if;
  if r.checkout_state='complete' then
    update public.billing_customers set checkout_request=gen_random_uuid(),checkout_created_at=now(),checkout_id=null,checkout_url=null,checkout_state='creating'
      where user_id=p_user_id and environment=p_environment returning * into r;
  end if;
  if r.checkout_url is null then
    if r.checkout_lease_until>now() then raise exception 'Checkout is already opening. Wait a moment, then try again.'; end if;
    update public.billing_customers set checkout_lease_until=now()+interval '2 minutes' where user_id=p_user_id and environment=p_environment returning * into r;
  end if;
  return r;
end; $$;
revoke all on function public.reserve_billing_checkout(uuid,text) from public,anon,authenticated;
grant execute on function public.reserve_billing_checkout(uuid,text) to service_role;

-- Apply a fresh provider snapshot atomically; older concurrent requests cannot roll it back.
create function public.apply_billing_snapshot(p_user_id uuid,p_environment text,p_observed_at timestamptz,p_subscriptions jsonb,p_receipts jsonb,p_completed_checkouts jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.billing_customers; s jsonb;
begin
  select * into strict r from public.billing_customers where user_id=p_user_id and environment=p_environment for update;
  if r.synced_at is not null and r.synced_at>p_observed_at then return; end if;
  for s in select * from jsonb_array_elements(p_subscriptions) loop
    insert into public.billing_subscriptions values(p_environment,s->>'subscription_id',p_user_id,s->>'product_id',s->>'status',(s->>'cancel_at_period_end')::boolean,(s->>'next_billing_at')::timestamptz,p_observed_at)
      on conflict(environment,subscription_id) do update set status=excluded.status,cancel_at_period_end=excluded.cancel_at_period_end,next_billing_at=excluded.next_billing_at,observed_at=excluded.observed_at;
  end loop;
  for s in select * from jsonb_array_elements(p_receipts) loop
    insert into public.billing_receipts values(p_environment,s->>'payment_id',s->>'subscription_id',p_user_id,s->>'product_id',(s->>'starts_at')::timestamptz,(s->>'ends_at')::timestamptz,(s->>'valid')::boolean,p_observed_at)
      on conflict(environment,payment_id,subscription_id) do update set valid=excluded.valid,observed_at=excluded.observed_at;
  end loop;
  update public.billing_customers set synced_at=p_observed_at,sync_error=null,
    checkout_state=case when p_completed_checkouts ? checkout_id then 'complete' else checkout_state end
    where user_id=p_user_id and environment=p_environment;
end; $$;
revoke all on function public.apply_billing_snapshot(uuid,text,timestamptz,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.apply_billing_snapshot(uuid,text,timestamptz,jsonb,jsonb,jsonb) to service_role;
create or replace function public.create_commitment(p_goal text, p_done_means text, p_deadline_at timestamptz, p_pledge text, p_pledge_check_at timestamptz, p_timezone text, p_request_id uuid default gen_random_uuid()) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id uuid; existing public.commitments;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:' || auth.uid()::text, 0));
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
  if (public.get_billing_state()->>'enabled')::boolean
    and not (public.get_billing_state()->>'paid')::boolean
    and (public.get_billing_state()->>'used')::integer >= 3 then
    raise exception 'Monthly allowance used. Your existing commitments stay available. Visit Account for your reset date or Plus.' using errcode = 'P0001';
  end if;
  insert into public.commitments(id, goal, done_means, deadline_at, pledge, pledge_check_at, timezone)
  values(p_request_id, trim(p_goal), trim(p_done_means), p_deadline_at, trim(p_pledge), p_pledge_check_at, p_timezone) returning id into v_id;
  if p_deadline_at - interval '2 hours' > now() then
    insert into public.reminder_jobs(commitment_id, kind, due_at) values(v_id, 'before_deadline', p_deadline_at - interval '2 hours');
  end if;
  insert into public.reminder_jobs(commitment_id, kind, due_at) values(v_id, 'goal_checkin', p_deadline_at);
  return v_id;
end; $$;

-- Direct RPC deletion cannot orphan a renewing subscription or a payable checkout.
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  perform pg_advisory_xact_lock(hashtextextended('billing:' || auth.uid()::text,0));
  if exists(select 1 from public.billing_customers where user_id=auth.uid() and checkout_state<>'complete')
    or exists(select 1 from public.billing_subscriptions where user_id=auth.uid() and status not in ('cancelled','expired')) then
    raise exception 'Close billing before deleting your account. Open Account billing or contact support to request deletion.';
  end if;
  delete from auth.users where id=auth.uid();
end; $$;
