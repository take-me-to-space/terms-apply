# Verification record

Build date: 17 October 2026 (owner timezone). Runtime: Node 24.19.0. This document records executed checks separately from deployment requirements.

| Check                                                                                                | Result                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and production build                                                                      | Passed                                                                                                                                    |
| Database permissions / RLS / transitions / jobs / deletion, PGlite PostgreSQL                        | Passed                                                                                                                                    |
| Local-time / DST validation, state presentation, private email content, worker boundaries            | Passed                                                                                                                                    |
| Chromium public form, review/edit, unsigned-draft retention, private-route guards                    | Passed                                                                                                                                    |
| Responsive public screens at 390px                                                                   | Passed                                                                                                                                    |
| Automated WCAG A/AA checks on public pages, agreement details, check-in dialog, and account settings | Passed (axe); not a claim of complete accessibility certification                                                                         |
| Netlify function bundled for Node                                                                    | Passed locally with esbuild                                                                                                               |
| npm audit including development dependencies                                                         | Zero reported vulnerabilities at build time                                                                                               |
| Real local Supabase Auth/PostgREST/Postgres/Mailpit integration                                      | Passed: confirmation, persistence, second-browser access, isolation, goal/pledge reports, withdrawal, export, consent, recovery, deletion |
| Hosted Supabase signup/recovery and cross-device journey                                             | Not run; owner project required                                                                                                           |
| Netlify production hosting and automatic schedule                                                    | Not run; owner site/access required                                                                                                       |
| External email inbox delivery via verified Resend sender                                             | Not run; owner sending domain/key required                                                                                                |
| Payments                                                                                             | Not implemented; no charges or subscriptions                                                                                              |

The standalone SQL suite uses the actual migration with test auth roles, not JavaScript simulations of server rules. The local-service browser suite uses actual Supabase Auth, PostgREST, Postgres, and captured SMTP emails. Neither proves the production configuration. Tests backdate only local fixtures to exercise delayed check-ins; production terms are never edited by the app.

Use the acceptance checklist in [DEPLOYMENT.md](DEPLOYMENT.md) after connecting real services. Record the production URL and commit SHA, external inbox delivery, schedule observations, and results there before launch. The existing waitlist site and Google Sheet have not been modified.

Final local run: `npm run check` passed 36 tests and the production build; `npm run test:e2e` passed 5 browser checks; `npm run test:services` passed the complete real-service browser journey. Screenshots in `docs/screenshots/` show the local UI with example terms, not a live customer account.
