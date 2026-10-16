# Operations

## Reminders

Netlify runs `reminders` every five minutes on the production deployment. The worker claims up to 10 due jobs per invocation, leases for 10 minutes, and rechecks consent, verified address, withdrawal, goal outcome, and pledge status immediately before sending. Requests are staggered by 750ms within a batch to avoid a burst against the email provider’s rate limit. There is one job per agreement and reminder kind. Create close to a deadline? Already-past advance reminders are skipped. A late/missed report after the pledge check-in schedules a pledge check-in immediately.

Resend receives a stable `Idempotency-Key` based on the job ID. Retry is limited to four attempts and 23 hours from first attempt, within Resend's 24-hour idempotency retention. An accepted-but-unrecorded message retries with the same key. An expired window is marked failed for inspection, rather than risking a duplicate. A crash after claim leaves an expiring lease; overlapping worker runs use `FOR UPDATE SKIP LOCKED`. Old lease tokens cannot finish a newer claim. HTTP 4xx errors other than 408/429 are permanent. Temporary errors retry after 15 minutes. Do not manually retry uncertain deliveries without checking the provider first.

Success means **accepted by the email provider**, not received/read. Inspect bounces/complaints in Resend and suppress delivery to problematic addresses using the provider's suppression features. No third-party mail event webhook is implemented in this release. Monitor scheduled-function failures and job failures through your hosting/provider alerts. If mail is unavailable, set `VITE_REMINDERS_ENABLED=false`, rebuild, and pause the function schedule or remove its sending key; the public flag alone does not stop the server worker. Do not leave opt-in available while delivery is knowingly broken.

Logs contain run counts, job IDs, status codes; no email bodies, addresses, or keys. Operator-only Supabase SQL diagnostics:

```sql
select status, kind, count(*) from public.reminder_jobs group by status, kind;
select id, kind, status, attempts, due_at, first_attempt_at, last_error
from public.reminder_jobs
where status = 'failed' or (status = 'processing' and locked_until < now())
order by due_at;
```

An opt-out or a final report can race with a provider request already in progress. Once the provider accepts a message, it cannot be recalled. State is rechecked immediately before that request; no impossible exactly-once delivery promise is made.

## Data and recovery

Supabase is the source of durable records; browser state is a cache/session/unsigned draft. Enable a backup and restore policy appropriate to launch. Test restore in an isolated project. Record your actual retention periods; do not promise immediate removal from backups. Account deletion removes the auth user, commitments, reports, settings, and jobs through cascading foreign keys. JWTs issued before deletion can survive until expiry, but the user has no remaining owned rows and cannot recreate data with a deleted user ID (foreign keys reject it). Supabase session invalidation and a short access-token lifetime add defence in depth.

The UI asks for the password again before deleting. The deletion RPC's server guarantee is the current authenticated user only; it does not claim that the UI's password prompt is a separate server authorization policy. Use Supabase's stronger reauthentication/MFA flow if adding high-risk account actions later.

## Aggregate product questions

Use operator-only aggregate queries; do not expose raw data or a public metrics endpoint. These outcomes are **self-reported**:

```sql
-- First and repeat commitment makers, without counting empty accounts as usage.
with activity as (select user_id, count(*) n from commitments group by user_id)
select count(*) as made_first, count(*) filter (where n >= 2) as made_another from activity;

-- Distinguish missing reports from recorded outcomes.
select g.outcome, count(*) from commitments c
left join goal_reports g on g.commitment_id = c.id
where c.deadline_at < now()
  and not exists(select 1 from withdrawals w where w.commitment_id = c.id)
group by g.outcome;

-- Pledge outcomes: not-yet is unresolved, not final failure.
select outcome, count(*) from pledge_reports group by outcome;
```

Pledge rows count answers, not unique users or final outcomes; for a final-outcome rate, filter `outcome <> 'not_yet'` and use triggered pledges as the denominator. Do not use unreported goals as missed goals. No billing or entitlement infrastructure exists yet; do not sell an automatically renewing subscription until implemented and tested.
