# Dodo live billing: owner setup and operation

Approved offer: Free = 3 new confirmed commitments per UTC calendar month. Plus = **₹99/month**, taxes included, unlimited new commitments, renewing until cancelled. Existing records, reporting, reminders, and exports remain available on either plan. A missed goal never causes a charge.

## Current status

The owner created the live Dodo product `pdt_0NqegAAJpk3ARtAmQeqCF` at ₹99/month. The app code now expects that product and amount. The new migration selects it but leaves billing disabled. Live API and webhook keys still need to be entered in Netlify. No payment has been taken. Checkout remains closed until the owner finishes the steps below.

## 1. Confirm the product

In Dodo **Live mode**, check Terms Apply Plus:

- INR ₹99, monthly recurring, tax-inclusive, no trial.
- Subscription duration: 20 years if Dodo shows a separate duration field.
- No discounts, addons, currency changes, or delivery entitlements. Keep Entitlements empty and Metadata off.
- Customer support: **sanyam.jain2027@mastersunion.org**. This is the owner-approved temporary support email; replace it later with a monitored domain inbox.

The server checks the live product details before opening checkout. It refuses a different price, currency, billing interval, tax treatment, trial, or discount. It also sets the recurring INR mandate floor to 9900 paise. If checkout reports a product mismatch, confirm the product settings in Dodo.

## 2. Point Supabase at the live product

The original billing setup migration is `supabase/migrations/202610220001_billing.sql`. Do not rerun it if the table already exists, and never rerun the original app migration.

In Supabase → **SQL Editor**, check whether the billing table exists:

```sql
select to_regclass('public.billing_config') as billing_config;
```

If the result is `null`, open the [billing setup migration](https://github.com/take-me-to-space/terms-apply/blob/main/supabase/migrations/202610220001_billing.sql) in GitHub, copy its full SQL into a new query, and run it once. Then apply the [live-product migration](https://github.com/take-me-to-space/terms-apply/blob/main/supabase/migrations/202610270001_live_billing_product.sql). If the table already exists, run only the live-product migration. It sets the live product and launch date, while keeping `enabled=false`; it does not delete user records or start billing.

## 3. Set the live API credentials in Netlify

In Dodo **Live mode**, create an API key. In Netlify → **Project configuration → Environment variables**, update/add these in the **Production** context, with **Functions** scope where available:

| Variable                    | Value                       |
| --------------------------- | --------------------------- |
| `DODO_PAYMENTS_ENVIRONMENT` | `live_mode`                 |
| `DODO_PRODUCT_ID`           | `pdt_0NqegAAJpk3ARtAmQeqCF` |
| `DODO_PAYMENTS_API_KEY`     | Your Dodo **live** API key  |
| `DODO_PAYMENTS_WEBHOOK_KEY` | Signing secret from step 4  |
| `BILLING_LIVE_READY`        | `false` for now             |

Keep both keys in Netlify only. Never put them in a `VITE_` variable, GitHub, or chat. Keep the existing Supabase and Resend server settings in place. The product ID is public; it does not authorise a payment.

## 4. Add the live webhook

In Dodo **Live mode**, create a webhook for:

```text
https://termsapply.me/.netlify/functions/dodo-webhook
```

Subscribe to payment, subscription, refund, and dispute events. Copy that endpoint's **live signing secret** to `DODO_PAYMENTS_WEBHOOK_KEY`. It is separate from the API key and from any test-mode signing secret. Leave provider retries enabled.

Save the Netlify variables, then go to **Deploys → Trigger deploy → Deploy site**. The deployment includes checkout, signed webhook processing, and scheduled reconciliation. The app verifies the product before it creates a checkout session; the payment is only submitted if the customer proceeds through Dodo's checkout and agrees to the recurring price.

## 5. Open live checkout

First, in Supabase SQL Editor, enable the configured product:

```sql
update public.billing_config
set enabled = true,
    environment = 'live_mode',
    product_id = 'pdt_0NqegAAJpk3ARtAmQeqCF'
where singleton = true;
```

Then in Netlify Environment variables, change `BILLING_LIVE_READY` to `true` and trigger another production deploy. Live checkout is then available to users. No one is charged by enabling it; a customer must choose Plus, agree to ₹99 monthly recurring billing, and complete payment at Dodo.

You can first open **Account** on the site and click Plus. The server checks that Dodo reports the configured ₹99 monthly, tax-inclusive product before creating a checkout session. If that check fails, no checkout is created; leave billing closed, correct the Dodo product, and redeploy. If it succeeds, the hosted checkout takes a real payment when completed.

## Support, cancellation, refunds and deletion

Cancellation stops renewal and retains access for the paid period. A refund is not automatic; refund requests are reviewed under the published terms and applicable consumer rights. Dodo retains financial/tax records under its own policy. The privacy page names these practices.

Dodo's SDK has no checkout invalidation endpoint. The app reuses an unfinished checkout and blocks account deletion while it could still accept payment. A user can request assistance at **sanyam.jain2027@mastersunion.org**. Verify their account email, close the payable checkout and cancel subscriptions in Dodo, then retry deletion. Do not bypass the database deletion guard while a checkout can still charge. Replace this temporary inbox with a monitored address when ready.

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
