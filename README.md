# Terms Apply

A goal. A deadline. Your own terms. A private follow-through app built with React, Supabase, and Netlify.

## Develop

Node 24 is the recommended runtime (22.12+ supported).

```sh
npm ci
cp .env.example .env
npm run dev
```

The public page and agreement composer work without service credentials. Saving records and using accounts require a Supabase project and the database migration. No fake accounts or browser-only replacement database is used.

```sh
npm run check       # TypeScript, PostgreSQL/rule tests, production bundle
npx playwright install chromium
npm run test:e2e    # public browser flows (no external accounts needed)
```

On this cloud machine Chromium is already installed: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`. If the sandbox cannot write npm's default cache, pass `--cache /tmp/terms-apply-npm-cache` to npm install/ci.

For real **local** auth/database/mail integration, with Docker installed:

```sh
npm run test:services
```

The harness starts disposable PostgreSQL 17, Supabase Auth, PostgREST, Kong, and Mailpit containers. It generates temporary credentials in memory, applies the real migration, launches Vite on port 5174, runs the complete account journey, then removes its test containers. All ports bind to loopback. It refuses to reuse an existing local test database and never uses production keys. This suite does not send external emails or establish production delivery.

`supabase/config.toml` is also available for developers who prefer the full Supabase CLI stack. Stop that stack before running the isolated integration harness; both use the standard local API/database ports.

## Deploy

Use [the step-by-step setup guide](docs/DEPLOYMENT.md). Import this GitHub repository into a **new** Netlify site; keep the owner's existing waitlist deployment and Google Sheet untouched. Set up Supabase, apply the migration, configure authentication SMTP/redirects, then add server-only Resend credentials for reminder delivery. No payments are enabled.

## How it is organised

- `src/` — responsive UI, account flows, composer, records, check-ins, settings, privacy.
- `supabase/migrations/` — tables, RLS, immutable-write RPCs, reminder jobs, deletion.
- `netlify/functions/reminders.ts` — scheduled, leased, idempotent email worker.
- `tests/` — SQL under real database roles, model/email tests, browser journeys.
- [Product rules](docs/PRODUCT.md), [implementation plan](docs/PLAN.md), [operations](docs/OPERATIONS.md), [verification record](docs/VERIFICATION.md).

Secrets belong in `.env` locally or Netlify/Supabase settings, never Git. Only `VITE_` variables are included in the browser bundle; **never** give a service credential that prefix.
