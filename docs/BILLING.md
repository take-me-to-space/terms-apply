# Dodo billing: owner setup and operation

Approved offer: Free = 3 new confirmed commitments per UTC calendar month. Plus = ₹199/month, taxes included, unlimited new commitments, renewing until cancelled. Existing records, reporting, reminders, and exports remain accessible. No card is required for Free; a missed goal never causes a charge.

## Current status

Implementation is in this repository. It is **not a verified live payment integration**. There are no provider credentials in this cloud workspace. Local SDK/HTTP fixtures, signed-event tests, database tests and browser checks cannot establish that your Dodo account accepts INR recurring payments or that checkout, renewals, cancellation, refunds and webhooks work with that account.

The migration starts disabled. Test billing is visible only to allowlisted accounts. Normal users continue using the existing app until the live rollout is explicitly configured. The confirmed Dodo **test product ID** is `pdt_0NqIIp0MtDK9rLdhZdqff`. Do not reuse that ID as a live product.

## 1. Finish the test product

In Dodo **test mode**, open Terms Apply Plus:

- Recurring price: INR 199, monthly, no trial, tax-inclusive.
- Payment frequency: 1 Month. If the dashboard exposes a separate total subscription duration, set 20 Years (the provider's recommended maximum for ongoing renewals). Setting a duration of 1 month would make it expire after a single cycle.
- No purchasing-power-parity pricing, discounts, addons or delivery entitlements.
- Disable adaptive/local currency changes for this offer if enabled at business level. Checkout requests INR and disables customer currency selection.
- Set the customer support contact to **sanyam.jain2027@mastersunion.org**. This is also the app's owner-approved public fallback. Later set `VITE_SUPPORT_EMAIL` to a monitored domain inbox and update Dodo's business contact.
- Keep portal plan changes/upsells disabled for this single-product launch. A new price/product needs a migration and review, not a silent dashboard price edit.

The server checks product settings before opening checkout. It refuses a different price, interval, tax treatment, discount or trial. If checkout reports a product mismatch, check these settings; do not bypass the validation. The server sets the INR mandate floor to 19900 paise to avoid a larger default authorisation ceiling; verify the actual mandate displayed by the provider in test mode.

## 2. Deploy the code and install the additive database migration

1. In Netlify → **Project configuration → Build & deploy**, confirm which production Git branch is connected. Publish the billing commit to that branch. Keep the separate waitlist site unchanged.
2. In Supabase → **SQL Editor**, create a new query. Paste the full contents of **`supabase/migrations/202610220001_billing.sql`** from this repository and run it once. Do **not** rerun the initial migration. Alternatively use the established Supabase migration CLI workflow.
3. This migration adds private billing tables and checked functions. It replaces the commitment-confirmation function to enforce an allowance only when billing is enabled and replaces account deletion with a billing guard. It does not delete existing records, edit confirmed terms, or activate charging. Supabase may flag function definitions containing deletion syntax; inspect the migration rather than removing the guard.
4. A deployment before this migration continues serving existing commitments; the Account billing section stays hidden if its RPC is absent. A disabled rollout allows normal confirmation while setup is unfinished.

## 3. Add Netlify runtime credentials

Dodo test mode → Developer/API keys (menu wording may vary): create/copy a **test API key**. Keep it out of chat, source files, `VITE_` variables and build logs.

In Netlify → **Environment variables**, add:

| Variable                    | Value                                  | Scope             |
| --------------------------- | -------------------------------------- | ----------------- |
| `DODO_PAYMENTS_ENVIRONMENT` | `test_mode`                            | Functions         |
| `DODO_PRODUCT_ID`           | `pdt_0NqIIp0MtDK9rLdhZdqff`            | Functions         |
| `DODO_PAYMENTS_API_KEY`     | Test API key from Dodo                 | Functions, secret |
| `DODO_PAYMENTS_WEBHOOK_KEY` | Signing secret from the endpoint below | Functions, secret |
| `BILLING_LIVE_READY`        | `false`                                | Functions         |

Use the **Production deploy context** even though these are Dodo sandbox credentials: the running app's Functions execute in that Netlify context. Continue using existing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `APP_URL=https://termsapply.me`. Set the same test values in deploy previews only if deliberately testing a separate preview environment/database.

Netlify may only offer scopes on certain plans. If unavailable, keep the exact server-only names; Vite only exposes `VITE_` values. Never disable secret scanning or add real keys to its omit list. The scanner exceptions cover only public `SUPABASE_URL`, `APP_URL`, `DODO_PRODUCT_ID` and `VITE_SUPPORT_EMAIL` values which intentionally appear in source/docs or the browser. Product identifiers do not authorise charges. Dodo API/signing keys, Supabase service credentials and Resend keys remain scanned.

## 4. Configure the signed webhook

In Dodo **test mode**, add a webhook endpoint:

```
https://termsapply.me/.netlify/functions/dodo-webhook
```

Subscribe to **all payment, subscription, refund and dispute events** available in the dashboard. Lifecycle events include payment succeeded/failed, subscription active/renewed/updated/cancelled/expired/failed/on_hold/past_due/paused/unpaused, plus refunds and disputes. Selecting all events is also safe; unrelated event types are acknowledged without granting access.

Copy this endpoint's **signing secret** into `DODO_PAYMENTS_WEBHOOK_KEY`. It is different from the API key. The function verifies the raw body using Dodo's SDK/Standard Webhooks, including timestamp and signature, before accessing account records. Keep the provider's retry delivery enabled.

After saving the variables, Netlify → **Deploys → Trigger deploy → Deploy site**. The function list under **Cloud compute → Functions** should contain `billing`, `dodo-webhook`, `billing-reconcile`, and `reminders`. Both scheduled workers run every five minutes. Do not repeatedly click checkout while a request is opening; a two-minute lease prevents parallel creation, and provider retry keys reuse the stored request.

## 5. Enable test billing only for your account

First sign up/sign in to Terms Apply and confirm your email. Use your **app-account email**, which may differ from your support address. In Supabase SQL Editor:

```sql
-- Replace this placeholder with the email you use to sign in to Terms Apply.
insert into public.billing_test_users(user_id)
select id from auth.users where lower(email)=lower('YOUR-APP-ACCOUNT-EMAIL')
on conflict do nothing;

-- Confirm exactly the intended account was added before enabling test billing.
select u.id,u.email from public.billing_test_users t
join auth.users u on u.id=t.user_id;

update public.billing_config
set enabled=true, environment='test_mode',
    product_id='pdt_0NqIIp0MtDK9rLdhZdqff'
where singleton=true;
```

Reload **Account** in the app. You should see Free usage and an explicit **Test checkout** notice. A different non-allowlisted account should not see billing. Monthly usage starts at the billing migration timestamp; the operator can change `started_at` at the live launch, but must not silently reset allowances after selling the plan.

## 6. Provider test acceptance — required before live activation

Record results and the tested commit in VERIFICATION.md:

1. Open Plus in Account. Confirm ₹199 monthly, taxes included, explicit renewal consent, no trial, cancel terms, support contact and test notice. Use only the current test payment details supplied by Dodo. Verify the actual displayed price/mandate, supported country/currency and mobile checkout.
2. Complete a test payment. Confirm the subscription, successful receipt/service period and webhook in Dodo. The app must unlock only after server verification; copying the return URL into a free account must not unlock anything. Test another device.
3. Send/replay the same event twice: no duplicate access/payment/checkout. Replay an older subscription event after cancellation/refund: fresh provider state must win. Invalid signatures must be rejected.
4. Close the browser during checkout; return to Account and refresh billing. Resume/retry the same session without creating a second subscription. Test rapid double-clicks, network timeout/uncertain responses and provider idempotency behavior. This SDK exposes a generic `idempotencyKey` option but does not set its header automatically, so the integration explicitly sends `Idempotency-Key`; acceptance must verify that the provider honours it for customer and checkout creation.
5. Decline/fail the payment: no Plus grant. Method-verification/zero payments and active subscriptions without a paid period must not grant access. Keep the original free draft intact.
6. Use provider test renewal controls where supported. A successful renewal adds its real paid period. A failed renewal never extends access beyond a previously paid period. Account shows payment issues; existing check-ins/history remain available.
7. Cancel renewal through Account and through Dodo's portal. Confirm cancellation on the provider, no future renewal, and access until the paid period ends. Test resubscription after expiry without duplicate subscriptions.
8. Refund a test payment and test dispute events where the provider supports them. The refunded/disputed receipt must not grant paid access. Verify recovery via Account refresh/scheduled reconciliation if a webhook is intentionally missed.
9. Exhaust 3 free commitments; the fourth confirmation is blocked without losing the draft. Withdraw one: no quota refund. Plus permits more; after expiry the free monthly limit resumes. Reporting/history/reminders/export must still work.
10. Delete a paid test account: future billing must stop before app data is removed. An unfinished checkout is deliberately blocked; exercise the support closure process below. Test a regular account with no billing too.

If the current Dodo API does not return authoritative `service_periods` on successful receipts, access fails closed. Inspect the provider's real response and adapt it explicitly; do not substitute a browser success parameter, arbitrary extra month, or an unverified active status. Keep live checkout off until tested.

## 7. Support, unfinished checkouts, refunds and deletion

Dodo's current SDK has no checkout invalidation endpoint. The app therefore reuses one pending checkout rather than repeatedly creating payable sessions. A partially created session older than 23 hours with no saved URL requires support review; it is not blindly retried outside the usual idempotency window.

A user can request closure/deletion at **sanyam.jain2027@mastersunion.org**. Authenticate the request through their app-account email. In the provider dashboard, inspect that customer, pending checkout/payment and every subscription, cancel future billing and invalidate/close any still-payable checkout if supported. Do not mark `checkout_state='complete'` merely to bypass the deletion guard while a link can still accept payment. If dashboard closure is unavailable, obtain provider support confirmation that the checkout cannot charge before removing the mapping. This remains a manual support dependency and must be verified in test mode before public billing. The database guard also checks historical test-mode billing, so close the owner's sandbox subscriptions before switching that account to live mode.

Refunds are reviewed individually under the published terms and applicable consumer rights; subscription cancellation is not an automatic refund. Process approved refunds through Dodo and check receipt revocation via webhook/reconciliation. Do not put payment/card information in commitment notes. Provider financial/tax records may remain after app data is deleted; the privacy page states this. Configure support-message handling and review this policy before accepting public payments.

## 8. Live cutover — a separate deliberate step

Do not enable this during sandbox setup. Complete provider activation/KYC, confirm provider fees and INR recurring-payment availability, review your public billing/refund terms and monitored support process, then:

1. Create a **live** product with the same checked settings; get its separate live product ID and API key.
2. Create a **live** webhook pointing to the same canonical endpoint; save its separate signing secret. Avoid overlap while one runtime uses a single provider environment. Keep old test events in test mode; do not send them to the live endpoint.
3. Update Netlify runtime environment/key/product/webhook secret together, then redeploy. Initially keep `BILLING_LIVE_READY=false`. Sales are closed, but existing customer management/webhooks continue to work.
4. Update the server-only `billing_config` row to `environment='live_mode'`, the live `product_id`, and an intentional `started_at` for the public allowance rollout. Keep `enabled=false` until the deployment is ready. Test receipts remain stored separately and cannot grant live access.
5. After acceptance, explicitly set `BILLING_LIVE_READY=true`, enable the config row, redeploy, and perform a small real paid journey including invoice, signed webhook, cancellation and refund. Record what happened. A sandbox pass alone is not production verification.
6. If you pause new sales, set `BILLING_LIVE_READY=false` and redeploy. Existing billing management, cancellation, webhooks and paid periods continue working. Do not switch credentials/environments or remove the webhook to pause checkout.

## Operations and data handling

Netlify logs use event types and diagnostic codes, not API keys, card data, emails, goals, pledges or raw provider payloads. Supabase's private tables record event IDs, processing attempts and outcome; they are inaccessible to browser roles. Signed duplicates are acknowledged after processing. Processing failures return non-2xx so Dodo retries. Reconciliation checks the three least-recently-synced customers every five minutes; Account refresh is an immediate fallback. For a larger customer base, replace this small-batch worker with a queue before freshness becomes unacceptable.

Useful SQL (operator/service role only):

```sql
select environment,event_type,received_at,attempts,error_code
from public.billing_events where processed_at is null order by received_at;

select environment,user_id,synced_at,sync_error
from public.billing_customers where sync_error is not null or synced_at<now()-interval '30 minutes';

select environment,status,cancel_at_period_end,count(*)
from public.billing_subscriptions group by 1,2,3;
```

Retain billing-event diagnostics only as long as operationally necessary (for example 90 days for processed events); do not delete unprocessed failures before resolving them. Configure provider failure alerts/review these queries regularly. Cancellation/support and failed webhook diagnosis are operator responsibilities even when subscriptions are sold through a merchant of record.
