import DodoPayments from 'dodopayments';
import {
  createClient,
  type SupabaseClient,
  type User,
} from '@supabase/supabase-js';
import type { Product } from 'dodopayments/resources/products/products';
import type { PaymentListResponse } from 'dodopayments/resources/payments';

export class BillingError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export function billingServices() {
  const env = process.env;
  const environment = env.DODO_PAYMENTS_ENVIRONMENT;
  if (
    !['test_mode', 'live_mode'].includes(environment || '') ||
    !env.DODO_PAYMENTS_API_KEY ||
    !env.DODO_PRODUCT_ID ||
    !env.SUPABASE_URL ||
    !env.SUPABASE_SERVICE_ROLE_KEY ||
    !env.APP_URL
  )
    throw new BillingError(
      'Billing is not available yet. Your existing commitments stay available.',
    );
  const origin = new URL(env.APP_URL);
  if (
    origin.protocol !== 'https:' ||
    origin.pathname !== '/' ||
    origin.username ||
    origin.password
  )
    throw new BillingError('Billing is not configured correctly.');
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
  });
  const dodo = new DodoPayments({
    bearerToken: env.DODO_PAYMENTS_API_KEY,
    webhookKey: env.DODO_PAYMENTS_WEBHOOK_KEY,
    environment: environment as 'test_mode' | 'live_mode',
    timeout: 8000,
    maxRetries: 1,
  });
  return {
    db,
    dodo,
    environment: environment!,
    productId: env.DODO_PRODUCT_ID,
    origin: origin.origin,
  };
}
export type Services = ReturnType<typeof billingServices>;
export async function requireUser(
  request: Request,
  db: SupabaseClient,
): Promise<User> {
  const token = request.headers
    .get('authorization')
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw new BillingError('Sign in to manage billing.', 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new BillingError('Sign in again to manage billing.', 401);
  if (!data.user.email_confirmed_at || !data.user.email)
    throw new BillingError('Confirm your email before starting checkout.', 403);
  return data.user;
}
export async function requireRollout(s: Services, userId: string) {
  const { data, error } = await s.db
    .from('billing_config')
    .select('*')
    .single();
  if (
    error ||
    !data?.enabled ||
    data.environment !== s.environment ||
    data.product_id !== s.productId
  )
    throw new BillingError('Billing is not available yet.');
  if (s.environment === 'test_mode') {
    const { data: tester, error } = await s.db
      .from('billing_test_users')
      .select('user_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !tester)
      throw new BillingError('Billing is not available for this account.', 403);
  }
}
export function validateProduct(product: Product) {
  const p = product.price;
  if (
    !product.is_recurring ||
    p.type !== 'recurring_price' ||
    p.currency !== 'INR' ||
    p.price !== 9900 ||
    p.payment_frequency_count !== 1 ||
    p.payment_frequency_interval !== 'Month' ||
    p.subscription_period_count !== 20 ||
    p.subscription_period_interval !== 'Year' ||
    (p.trial_period_days || 0) !== 0 ||
    p.tax_inclusive !== true ||
    p.purchasing_power_parity ||
    p.discount ||
    p.discount_bps
  )
    throw new BillingError(
      'The billing product does not match the ₹99 monthly plan. Please contact support.',
    );
}
export function providerUrl(value: string | null | undefined) {
  if (!value)
    throw new BillingError(
      'The payment provider did not return a checkout link.',
    );
  const url = new URL(value);
  if (
    url.protocol !== 'https:' ||
    !(
      url.hostname === 'dodopayments.com' ||
      url.hostname.endsWith('.dodopayments.com')
    ) ||
    url.username ||
    url.password
  )
    throw new BillingError('The payment provider returned an unexpected link.');
  return url.href;
}
export type Customer = {
  user_id: string;
  environment: string;
  customer_id: string | null;
  checkout_request: string;
  checkout_created_at: string;
  checkout_id: string | null;
  checkout_url: string | null;
  checkout_state: string;
  deleting: boolean;
  synced_at: string | null;
};
export async function customerFor(
  s: Services,
  userId: string,
): Promise<Customer | null> {
  const { data, error } = await s.db
    .from('billing_customers')
    .select('*')
    .eq('user_id', userId)
    .eq('environment', s.environment)
    .maybeSingle();
  if (error)
    throw new BillingError('Could not read billing. Please try again.');
  return data;
}
function check(error: { code?: string } | null) {
  if (error)
    throw new BillingError('Could not save billing. Please try again.');
}
export function receiptRows(
  payment: PaymentListResponse,
  subscription: {
    subscription_id: string;
    product_id: string;
    customer: { customer_id: string };
  },
) {
  if (payment.customer.customer_id !== subscription.customer.customer_id)
    throw new BillingError('Payment ownership did not match.', 502);
  const valid =
    payment.status === 'succeeded' &&
    payment.currency === 'INR' &&
    payment.total_amount === 9900 &&
    !payment.refund_status &&
    (!payment.dispute_status ||
      ['dispute_won', 'dispute_cancelled'].includes(payment.dispute_status)) &&
    ['new', 'renewal'].includes(payment.charge_type || '') &&
    !payment.is_multi_subscription;
  return (payment.service_periods || [])
    .filter((p) => p.subscription_id === subscription.subscription_id)
    .map((p) => ({
      payment_id: payment.payment_id,
      subscription_id: subscription.subscription_id,
      product_id: subscription.product_id,
      starts_at: p.starts_at,
      ends_at: p.ends_at,
      valid,
    }));
}
export async function syncCustomer(s: Services, customer: Customer) {
  if (!customer.customer_id) return;
  const observedAt = new Date().toISOString();
  const subscriptions = [];
  const receipts = [];
  const completed = [];
  // Bound the amount of work per request. The product has one subscription per account.
  let count = 0;
  for await (const item of s.dodo.subscriptions.list({
    customer_id: customer.customer_id,
    product_id: s.productId,
    page_size: 20,
  })) {
    if (++count > 20)
      throw new BillingError(
        'Billing needs a support review. Please contact support.',
      );
    const sub = await s.dodo.subscriptions.retrieve(item.subscription_id);
    if (
      sub.customer.customer_id !== customer.customer_id ||
      sub.product_id !== s.productId
    )
      throw new BillingError('Subscription ownership did not match.', 502);
    subscriptions.push({
      subscription_id: sub.subscription_id,
      product_id: sub.product_id,
      status: sub.status,
      cancel_at_period_end: sub.cancel_at_next_billing_date,
      next_billing_at: sub.next_billing_date,
    });
    // Include the currently paid period and recent receipts. Older expired periods cannot grant access.
    let seen = 0;
    for await (const payment of s.dodo.payments.list({
      subscription_id: sub.subscription_id,
      created_at_gte: new Date(Date.now() - 65 * 86400000).toISOString(),
      page_size: 20,
    })) {
      if (++seen > 100)
        throw new BillingError('Billing needs a support review.');
      receipts.push(...receiptRows(payment, sub));
      if (payment.status === 'succeeded' && payment.checkout_session_id)
        completed.push(payment.checkout_session_id);
    }
  }
  // Re-fetch any locally entitled receipt not covered by the list, including old refunded receipts.
  const { data: current, error: currentError } = await s.db
    .from('billing_receipts')
    .select('payment_id,subscription_id,product_id,starts_at,ends_at')
    .eq('user_id', customer.user_id)
    .eq('environment', s.environment)
    .eq('valid', true)
    .gt('ends_at', new Date().toISOString());
  check(currentError);
  for (const r of current || []) {
    if (
      receipts.some(
        (p) =>
          p.payment_id === r.payment_id &&
          p.subscription_id === r.subscription_id,
      )
    )
      continue;
    const p = await s.dodo.payments.retrieve(r.payment_id);
    if (p.customer.customer_id !== customer.customer_id)
      throw new BillingError('Payment ownership did not match.', 502);
    const valid =
      p.status === 'succeeded' &&
      p.currency === 'INR' &&
      p.total_amount === 9900 &&
      !p.refund_status &&
      !p.is_update_payment_method &&
      !(p.refunds || []).some((r) => r.status === 'succeeded') &&
      !(p.disputes || []).some(
        (d) => !['dispute_won', 'dispute_cancelled'].includes(d.dispute_status),
      );
    receipts.push({ ...r, valid });
  }
  const { error } = await s.db.rpc('apply_billing_snapshot', {
    p_user_id: customer.user_id,
    p_environment: s.environment,
    p_observed_at: observedAt,
    p_subscriptions: subscriptions,
    p_receipts: receipts,
    p_completed_checkouts: completed,
  });
  check(error);
}
export async function checkout(s: Services, user: User) {
  if (
    s.environment === 'live_mode' &&
    process.env.BILLING_LIVE_READY !== 'true'
  )
    throw new BillingError('Live billing has not been enabled yet.');
  if (!process.env.DODO_PAYMENTS_WEBHOOK_KEY)
    throw new BillingError('Payment verification is not configured yet.');
  await requireRollout(s, user.id);
  validateProduct(await s.dodo.products.retrieve(s.productId));
  const existing = await customerFor(s, user.id);
  if (existing) await syncCustomer(s, existing);
  const { data, error } = await s.db.rpc('reserve_billing_checkout', {
    p_user_id: user.id,
    p_environment: s.environment,
  });
  if (error)
    throw new BillingError(
      'An existing checkout or subscription needs attention. Refresh billing in Account or contact support.',
      409,
    );
  const customer = data as Customer;
  if (customer.checkout_url) return providerUrl(customer.checkout_url);
  if (
    Date.now() - Date.parse(customer.checkout_created_at) >
    23 * 60 * 60 * 1000
  )
    throw new BillingError(
      'This checkout needs a support review before it can be retried.',
      409,
    );
  if (!customer.customer_id) {
    const created = await s.dodo.customers.create(
      { email: user.email!, name: user.email! },
      {
        headers: {
          'Idempotency-Key': `terms-apply-customer-${customer.checkout_request}`,
        },
      },
    );
    const { error } = await s.db
      .from('billing_customers')
      .update({ customer_id: created.customer_id })
      .eq('user_id', user.id)
      .eq('environment', s.environment)
      .is('customer_id', null);
    check(error);
    const canonical = await customerFor(s, user.id);
    if (!canonical?.customer_id)
      throw new BillingError('Could not save the billing account.');
    customer.customer_id = canonical.customer_id;
  }
  const session = await s.dodo.checkoutSessions.create(
    {
      product_cart: [{ product_id: s.productId, quantity: 1 }],
      customer: { customer_id: customer.customer_id },
      billing_currency: 'INR',
      mandate_min_amount_inr_paise: 9900,
      return_url: `${s.origin}/settings?checkout=returned`,
      cancel_url: `${s.origin}/settings?checkout=cancelled`,
      feature_flags: {
        allow_currency_selection: false,
        allow_discount_code: false,
        allow_customer_editing_email: false,
        allow_editing_addons: false,
        allow_phone_number_collection: false,
      },
    },
    {
      headers: {
        'Idempotency-Key': `terms-apply-checkout-${customer.checkout_request}`,
      },
    },
  );
  const url = providerUrl(session.checkout_url);
  const { error: saveError } = await s.db
    .from('billing_customers')
    .update({
      checkout_id: session.session_id,
      checkout_url: url,
      checkout_state: 'open',
    })
    .eq('user_id', user.id)
    .eq('environment', s.environment)
    .eq('checkout_request', customer.checkout_request);
  check(saveError);
  return url;
}
export async function cancelSubscriptions(
  s: Services,
  customer: Customer,
  immediately = false,
) {
  if (!customer.customer_id) return;
  for await (const sub of s.dodo.subscriptions.list({
    customer_id: customer.customer_id,
    product_id: s.productId,
    page_size: 20,
  })) {
    if (!['cancelled', 'expired'].includes(sub.status))
      await s.dodo.subscriptions.update(
        sub.subscription_id,
        immediately
          ? { status: 'cancelled' }
          : { cancel_at_next_billing_date: true },
      );
  }
  await syncCustomer(s, customer);
}
export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}
export function failure(error: unknown, operation: string) {
  // Provider errors may contain personal or financial details. Log codes only.
  console.error(operation, {
    code:
      error instanceof BillingError
        ? error.status
        : 'provider_or_database_error',
    provider_status:
      error instanceof DodoPayments.APIError ? error.status : undefined,
  });
  return json(
    {
      error:
        error instanceof BillingError
          ? error.message
          : 'Billing could not be updated. Please try again or contact support.',
    },
    error instanceof BillingError ? error.status : 502,
  );
}
