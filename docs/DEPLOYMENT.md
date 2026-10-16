# Owner setup and launch

This is the app, separate from `https://terms-apply.netlify.app/` and its existing Google Sheet waitlist. Do not repoint or replace that site until you choose to retire the waitlist. These instructions do not migrate waitlist entries into accounts.

## 1. Supabase

1. Create a Supabase project in a region appropriate for your users. Save the database password in your password manager. Free service plans are useful for evaluation; review pausing, backups, resource limits, and commercial requirements before public launch.
2. In the SQL editor run `supabase/migrations/202610170001_initial.sql` **once**. Prefer the Supabase CLI migration workflow for subsequent changes (`supabase link`, then `supabase db push`). Do not reapply the initial migration over an existing database. RLS and function grants are part of this migration and must not be skipped.
3. In project API settings copy the project URL and **anon / publishable** key for the frontend. The backend needs the **service-role** key, stored only in server function settings. Never use the service-role key in `VITE_SUPABASE_ANON_KEY`.
4. Authentication: enable email/password signup and email confirmation. Set minimum password length to 12, enable available password-strength/leaked-password protection, and keep authentication rate limits enabled. Disable anonymous sign-in. Add CAPTCHA through the supported Supabase integration if signup abuse appears; do not disable verification to work around delivery errors.
5. URL configuration: set Site URL to the app's final canonical HTTPS origin. Add redirect entries for `https://YOUR-APP/auth**` and `https://YOUR-APP/reset-password`. The suffix on `/auth` permits the app's `next` query parameter. Only allow origins you own. For local development add `http://localhost:5173/auth**` and `http://localhost:5173/reset-password`. Account confirmation and recovery PKCE links should be opened in the browser that requested them; otherwise request a fresh link there. Test both flows.

## 2. Sending domain / Resend

1. Buy your domain wherever you prefer. A subdomain such as `mail.yourdomain.com` keeps transactional sending separate from the app hostname. Create a Resend account and follow its domain-verification instructions (SPF/DKIM and any required MX records). Keep the records exactly as provided; wait for verification.
2. Use a sender on the verified domain, for example `Terms Apply <hello@mail.yourdomain.com>`. Create a sending API key. Store it in Netlify server variables.
3. Configure **custom SMTP in Supabase Authentication** too. Default Supabase email delivery is restricted and is not a production signup/recovery solution. For Resend use the current official SMTP settings (normally host `smtp.resend.com`, port 465, username `resend`, password your sending API key), with the verified sender. Confirm these against your provider dashboard. Secrets go in Supabase settings, never a SQL migration or the browser.
4. Disable open/click tracking for transactional mail where possible. Review Resend data retention and processing terms. The reminder worker sends recipient address, generic reminder copy, scheduled time, timezone, and agreement link. It omits goal/pledge text and notes.

## 3. Netlify

1. Import `take-me-to-space/terms-apply` from GitHub into a **new site**. The repo's `netlify.toml` defines `npm run build`, `dist`, Node 24, headers, SPA routes, and the five-minute reminder schedule. Keep the waitlist site unchanged.
2. Add these public build variables:

   | Variable                 | Value                                        |
   | ------------------------ | -------------------------------------------- |
   | `VITE_SUPABASE_URL`      | Supabase HTTPS project URL                   |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable key, never service-role   |
   | `VITE_REMINDERS_ENABLED` | `false` until real delivery is verified      |
   | `VITE_SUPPORT_EMAIL`     | Monitored operator email for privacy/support |

3. Add these **server-only, Functions-scoped** secrets/settings:

   | Variable                    | Value                                                         |
   | --------------------------- | ------------------------------------------------------------- |
   | `SUPABASE_URL`              | Same project URL                                              |
   | `SUPABASE_SERVICE_ROLE_KEY` | Server service-role key                                       |
   | `RESEND_API_KEY`            | Sending key                                                   |
   | `EMAIL_FROM`                | Verified sender, e.g. `Terms Apply <hello@mail.example.com>`  |
   | `APP_URL`                   | Canonical app origin, e.g. `https://app.example.com`, no path |

4. Deploy. Test on the Netlify production site first. Scheduled functions run on published production deploys, not deploy previews. Confirm your Netlify plan supports scheduled functions, timeout limits, and expected usage. Inspect the function bundle/logs.
5. Point your purchased domain/subdomain to this **new app site** in Netlify's Domain management, enable HTTPS, then update Supabase URLs and `APP_URL`. Trigger a rebuild after changing `VITE_` variables.
6. Deploy previews must use a separate staging Supabase project and email setup, or omit credentials. **Never** point an untrusted PR preview at production keys. Never copy production service keys into preview contexts. All normal app writes are browser-to-Supabase with RLS; previews sharing a project share that project's data.
7. The CSP permits `*.supabase.co`. If you enable a Supabase custom API domain, add that exact HTTPS/WSS domain to the CSP in `netlify.toml` before using it. Fonts are self-hosted.

## 4. Real-service acceptance test (required before launch)

Use two owner-controlled test accounts and a staging project when changing timestamps. Never edit real users' terms to make testing easier.

- [ ] Sign up, receive a real verification email, verify in the originating browser, sign in, sign out.
- [ ] Request recovery, receive email, set a new password, sign in with the new password. Try an expired link too.
- [ ] Review, edit, and confirm an agreement; reload and open on a second device. Confirm original terms and timestamps survive.
- [ ] In account B, request A's agreement URL and directly query A's records with B's token; no records returned. An arbitrary `user_id` cannot grant access.
- [ ] Record an early completion. No pledge becomes due. Try modifying confirmed terms/directly inserting a report: rejected.
- [ ] Report an on-time completion **after** its deadline, using the actual earlier completion time. It remains on time.
- [ ] Report a late completion: pledge becomes due. A missed outcome cannot be entered early. Silence stays unreported.
- [ ] Pledge: save not yet, wait at least a minute, then save a final answer after its check-in time. Both records remain.
- [ ] Withdraw an unreported agreement. The original terms remain, with no successful outcome.
- [ ] Opt in to reminders. Test an advance message, deadline check-in, and pledge check-in. Check delivery in an actual external inbox, not just an API acceptance response. Inspect Netlify logs, database job states, and provider dashboard for retries/failures.
- [ ] Disable reminders, complete a goal, and withdraw a goal in separate test cases; no irrelevant queued message is sent. Simulate a transient email failure and retry with the same job key; confirm no duplicate provider send.
- [ ] Confirm the scheduled function runs on its own while all app tabs are closed. Then set `VITE_REMINDERS_ENABLED=true` and rebuild.
- [ ] Export the record. Delete a test account. Confirm live database rows/jobs and auth user are removed, the old session cannot access records, and the other account remains.
- [ ] Review privacy copy, operator contact, service retention/backup policy, restore process, and service costs with the actual configuration.

Keep the deployment URL, commit SHA, test date, service versions, and outcomes in `docs/VERIFICATION.md`. Do not record passwords, keys, tokens, or private customer data. A local build or test email to a provider's sandbox is not production acceptance.
