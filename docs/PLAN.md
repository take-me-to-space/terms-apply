# Implementation plan

1. Establish architecture and product invariants (PRODUCT.md).
2. Build the public page and accessible, responsive commitment composer. The owner selected direction A on 18 October 2026: condensed Barlow headlines, IBM Plex Sans text, restrained vermilion accents, a photographic walking example, and direct product copy. Apply the system documented in DESIGN.md across the app.
3. Implement verified accounts, immutable agreements, goal and pledge check-ins, withdrawal, history, settings, and deletion.
4. Implement durable reminders with consent, state checks, bounded retries, and operator diagnostics.
5. Validate the database under actual user roles, browser flows, production bundle, and server function types. Document owner setup and a production smoke-test checklist.

Routine defaults: Netlify hosting; Supabase auth/database; Resend delivery; email/password; no billing; browser timezone. External blockers for publication and live validation: owner service projects, Supabase keys, Resend key and verified sender, Netlify access, chosen canonical domain. No secret values belong in chat or Git.
