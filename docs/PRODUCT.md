# Terms Apply

A private agreement with yourself: one concrete goal, a deadline, and a pledge you choose if you miss it. The product records self-reports. It does not verify behaviour, enforce consequences, or move money.

## First release

1. Email/password accounts, email verification, sign-in/out, password recovery, and account deletion.
2. Draft → review all five terms → explicitly confirm an immutable agreement.
3. Multiple commitments; early completion allowed. Server derives on-time/late from claimed completion time, never report time. Missed cannot be reported early. Silence stays unreported.
4. Late and missed goals activate the pledge. Pledge answers are honoured, not honoured, or not yet. Not yet remains unresolved; all answers stay in history. Final pledge reports are accepted only at/after the chosen check-in time, so time-based pledges have time to happen.
5. Withdraw only before a goal outcome. Preserve the terms, reason, and timestamp. Reports and withdrawals are append-only. No correction UI in v1; contact the operator for a data-access question. Do not silently edit historical answers.
6. Optional email: roughly two hours before deadline, one goal check-in after deadline, and one pledge check-in if relevant. No repeated nagging. A last-minute commitment skips an already-past advance reminder. Worker rechecks state and consent before delivery.
7. Server-enforced user isolation, immutable records, private history, and deletion through a signed-in confirmation flow.

No subscriptions, paywalls, recurring habits, public feeds, proof collection, automatic penalties, or waitlist integration in this release. The existing Netlify landing page / Google Sheet remains separate and untouched.

## Architecture

React + TypeScript + Vite produces static assets for Netlify. Supabase provides managed Postgres and email/password authentication. All writes go through checked database functions; row-level security restricts reads to the current account. The browser never receives a service-role key. Postgres timestamps are UTC; the UI captures the device timezone and renders dates locally.

A scheduled Netlify function claims durable email jobs in Postgres, rechecks eligibility, calls Resend with a stable idempotency key, and records success/failure. Retries stop inside the provider's idempotency window to avoid duplicate delivery after an uncertain response. Failures are visible to the operator. Transactional email has an unavoidable narrow race with a simultaneous user action; it cannot be recalled once accepted by the provider.

## Measurement and monetisation

Do not charge yet. The private data already permits aggregate counts of first commitments, reports, repeat commitments, and self-reported pledge outcomes. Use aggregate queries (docs/OPERATIONS.md), with no third-party behavioural tracker. A paid offer should be designed after learning whether people return; the seven-free/₹199 proposal is not implemented or treated as decided.

## Delivery boundaries

Repository tests exercise real PostgreSQL semantics through PGlite, including roles/RLS, RPC access control, history, jobs, and deletion grants. Browser tests exercise the real public UI and form flow. Production auth emails, cross-device persistence, Netlify scheduling, and Resend delivery require connected owner accounts and a live smoke test. Local checks do not establish those claims.
