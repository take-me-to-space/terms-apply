# Verification record

## Direction A redesign — 18 October 2026

Runtime: Node 24.19.0, Chromium installed at `/usr/bin/chromium`. The owner selected A · Print. The redesign changes presentation and copy throughout the app and reminder emails; database migrations and access-control rules are unchanged. No new environment variables or database setup are required for the web redesign.

| Check                                                                                             | Result                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript, rule/database/model/worker tests, production build                                    | Passed: `npm run check`, 37 tests; final production build rerun after the last CSS refinement                                                                                              |
| Public browser journey, review/edit, unsigned-draft retention, route guards and responsive layout | Passed: 5 Playwright checks                                                                                                                                                                |
| Actual local Auth/PostgREST/Postgres/Mailpit account journey                                      | Passed: signup email/confirmation, persistence, another browser, isolation, early goal report, late goal/pledge, not yet/final history, withdrawal, export, opt-in/out, recovery, deletion |
| Expanded private/public visual checks                                                             | Passed: 16 surfaces at 1440px and 390px, axe WCAG A/AA and horizontal overflow checks; each also checked for overflow at 320px                                                             |
| Other public viewport checks                                                                      | Passed at 320px, 768px and 1024px for landing, composer, sign-in, recovery and privacy                                                                                                     |
| Reminder function bundle                                                                          | Passed: esbuild, Node 24 target                                                                                                                                                            |
| Email HTML                                                                                        | Passed: reminder, signup and recovery previews at desktop/320px, automated accessibility and overflow checks; token URL substituted with a sample URL for account template previews        |
| Email privacy                                                                                     | Tests verify both formats link to the private agreement/settings and omit recipient data from content; agreement ID is encoded in links                                                    |
| Supabase template configuration                                                                   | Local TOML paths resolve and both HTML files retain `{{ .ConfirmationURL }}`                                                                                                               |
| Hosted Supabase template application                                                              | Not applied from this environment; owner dashboard action required. See DEPLOYMENT.md                                                                                                      |
| Live verification of this redesigned deployment                                                   | Not independently verified. This cloud environment has no Netlify/Supabase management connection and direct requests to the production domain are blocked by its network proxy             |
| Billing                                                                                           | Not implemented; no charges or subscriptions                                                                                                                                               |

The expanded browser run uses `CAPTURE_DESIGN=1 PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:services`. Screenshots in `docs/screenshots/` show disposable local test records and generated example emails, not live customer accounts. The photo and self-hosted fonts are bundled locally; the main 1280px photo is about 98KB and the smaller derivative is about 41KB.

An initial integration assertion was ambiguous after the same on-time wording appeared in both the action heading and history. It was scoped to the action heading; the underlying outcome assertions were retained. The final expanded journey passed after the CSS and narrow-screen refinements. Disposable containers and their database were removed by the test harness.

The SQL suite executes the real migration under PostgreSQL auth roles; it does not simulate server permissions in JavaScript. The local-service suite uses actual Auth, PostgREST, Postgres and captured SMTP emails. It backdates only disposable local fixtures to exercise delayed reports. Production terms are never edited by the app.

## Earlier deployment evidence

During onboarding, the owner reported successful signup and confirmation email, scheduled reminder delivery with the app closed, a working agreement link, and secure access at `https://termsapply.me` in a fresh browser. The main-domain authentication URLs and reminder origin were then updated by the owner. Those observations predate this redesign and are not independent verification of the new deploy.

Real password recovery on the canonical domain was requested as a final onboarding check but has not been separately confirmed by the owner. Hosted template changes must be followed by a fresh real signup and recovery test. The local Docker harness uses Auth's default templates, so its successful journey does not prove a dashboard template change.

The original 17 October build passed 36 automated tests and 6 browser checks, including the real local-service journey. Its npm audit reported zero vulnerabilities at build time. The redesign removes two unused font packages and does not add runtime dependencies; an advisory audit was not repeated as part of visual verification.

Use the live acceptance checklist in [DEPLOYMENT.md](DEPLOYMENT.md) for production checks. Record the published commit and date when verifying the redesigned site. GitHub updates alone do not establish that Netlify finished deployment or that external email arrived.
