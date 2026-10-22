# Working on Terms Apply

Read `docs/PRODUCT.md` before changing product behaviour. Use this existing checkout; cloud tasks are already isolated. Do not create a worktree unless asked.

- Supabase is the server authority. Every write must check the authenticated owner and all transitions. Keep RLS and explicit RPC grants. Never put a service-role key in the browser.
- Confirmed terms and submitted reports are immutable. Add explicit correction events if corrections are designed later; never quietly rewrite history.
- Report time and claimed completion time are distinct. Late completion activates the pledge. No report is not failure; not yet is unresolved. Withdrawal is not completion.
- Users choose pledges. No financial penalties, proof checks, assigned consequences, or automatic enforcement claims.
- Existing waitlist site/Google Sheet is separate. Do not alter it without explicit instructions. The owner approved three new commitments per UTC calendar month free and ₹199/month Plus with unlimited new commitments. Billing starts in allowlisted Dodo test mode; never enable real charging without completing the documented provider acceptance checks. Existing records, reports, and reminders stay accessible on either plan.
- Run `npm run check` and `npm run test:e2e` for relevant changes. SQL tests execute migrations under PostgreSQL roles via PGlite. Never call mock/local checks production verification.
- Deployment steps and required live acceptance are in `docs/DEPLOYMENT.md`; record results in `docs/VERIFICATION.md`. Never commit secrets.
- Self-host fonts. Preserve keyboard access, visible focus, reduced-motion support, responsive layout, and plain product copy.
