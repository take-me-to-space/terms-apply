import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DodoPayments from 'dodopayments';
import { Webhook } from 'standardwebhooks';
import type { User } from '@supabase/supabase-js';
import type { Product } from 'dodopayments/resources/products/products';
import type { PaymentListResponse } from 'dodopayments/resources/payments';

const mocks = vi.hoisted(() => ({ services: vi.fn() }));
vi.mock('../netlify/lib/billing', async (original) => ({
  ...(await original<object>()),
  billingServices: mocks.services,
}));
import {
  billingServices,
  checkout,
  receiptRows,
  requireUser,
  validateProduct,
  providerUrl,
  type Services,
} from '../netlify/lib/billing';
import billingHandler from '../netlify/functions/billing';
import webhookHandler from '../netlify/functions/dodo-webhook';

const product = {
  product_id: 'pdt_test',
  is_recurring: true,
  price: {
    type: 'recurring_price',
    currency: 'INR',
    price: 19900,
    tax_inclusive: true,
    payment_frequency_count: 1,
    payment_frequency_interval: 'Month',
    subscription_period_count: 20,
    subscription_period_interval: 'Year',
    trial_period_days: 0,
  },
} as Product;
const period = {
  subscription_id: 'sub_alice',
  starts_at: '2026-10-01T00:00:00Z',
  ends_at: '2026-11-01T00:00:00Z',
  proration_factor: '1',
};
const payment = {
  payment_id: 'pay_alice',
  customer: { customer_id: 'cus_alice' },
  currency: 'INR',
  total_amount: 19900,
  status: 'succeeded',
  charge_type: 'new',
  service_periods: [period],
  is_multi_subscription: false,
  checkout_session_id: 'cks_alice',
} as PaymentListResponse;
const subscription = {
  subscription_id: 'sub_alice',
  product_id: 'pdt_test',
  customer: { customer_id: 'cus_alice' },
  status: 'active',
  cancel_at_next_billing_date: false,
  next_billing_date: period.ends_at,
};
const user = {
  id: 'alice',
  email: 'alice@example.com',
  email_confirmed_at: '2026-10-01',
} as User;
const webhookKey = Buffer.from(
  'test-signing-key-at-least-32-bytes-long',
).toString('base64');
let customer: Record<string, unknown> | null;
let event: Record<string, unknown> | null;
let writes: { table: string; data: Record<string, unknown> }[];
let providerCalls: {
  url: string;
  method: string;
  body: unknown;
  idempotency: string | null;
}[];
let rpc: ReturnType<typeof vi.fn>;
let s: Services;
let syncFails = false;
let hasSubscription = false;
let currentStatus = 'active';
let cancelScheduled = false;
function builder(table: string) {
  let data: Record<string, unknown> | undefined;
  let mutation = '';
  const b = {
    select: () => b,
    eq: () => b,
    is: () => b,
    gt: () => b,
    update: (value: Record<string, unknown>) => {
      data = value;
      mutation = 'update';
      return b;
    },
    upsert: (value: Record<string, unknown>) => {
      data = value;
      mutation = 'insert';
      return b;
    },
    maybeSingle: () => b,
    single: () => b,
    then: (resolve: (result: unknown) => unknown) => {
      if (data) {
        writes.push({ table, data });
        if (table === 'billing_events')
          event =
            mutation === 'insert' && event ? event : { ...event, ...data };
        if (table === 'billing_customers') customer = { ...customer, ...data };
      }
      const result =
        table === 'billing_config'
          ? { enabled: true, environment: 'test_mode', product_id: 'pdt_test' }
          : table === 'billing_test_users'
            ? { user_id: 'alice' }
            : table === 'billing_customers'
              ? customer
              : table === 'billing_events'
                ? { attempts: 0, ...event }
                : [];
      return Promise.resolve(resolve({ data: result, error: null }));
    },
  };
  return b;
}
beforeEach(() => {
  customer = null;
  event = null;
  writes = [];
  providerCalls = [];
  syncFails = false;
  hasSubscription = false;
  currentStatus = 'active';
  cancelScheduled = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubEnv('DODO_PAYMENTS_WEBHOOK_KEY', webhookKey);
  rpc = vi.fn(async (name: string) => {
    if (name === 'reserve_billing_checkout') {
      customer ||= {
        user_id: 'alice',
        environment: 'test_mode',
        customer_id: null,
        checkout_request: 'request-one',
        checkout_created_at: new Date().toISOString(),
        checkout_id: null,
        checkout_url: null,
        checkout_state: 'creating',
      };
      return { data: customer, error: null };
    }
    if (syncFails) return { data: null, error: { code: 'XX000' } };
    return { data: null, error: null };
  });
  const fetcher: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const parsed = new URL(req.url);
    const path = parsed.pathname;
    const page = Number(parsed.searchParams.get('page_number') || '1');
    const text =
      req.method === 'POST' || req.method === 'PATCH'
        ? await req.clone().text()
        : '';
    providerCalls.push({
      url: req.url,
      method: req.method,
      body: text ? JSON.parse(text) : null,
      idempotency: req.headers.get('idempotency-key'),
    });
    let result: unknown;
    if (path === '/products/pdt_test') result = product;
    else if (path === '/customers') result = { customer_id: 'cus_alice' };
    else if (path === '/checkouts')
      result = {
        session_id: 'cks_alice',
        checkout_url: 'https://test.checkout.dodopayments.com/session',
      };
    else if (path === '/subscriptions')
      result = { items: hasSubscription && page === 1 ? [subscription] : [] };
    else if (path === '/subscriptions/sub_alice') {
      if (req.method === 'PATCH') {
        const update = JSON.parse(text);
        if (update.status) currentStatus = update.status;
        if (update.cancel_at_next_billing_date !== undefined)
          cancelScheduled = update.cancel_at_next_billing_date;
      }
      result = {
        ...subscription,
        status: currentStatus,
        cancel_at_next_billing_date: cancelScheduled,
      };
    } else if (path === '/payments')
      result = { items: page === 1 ? [payment] : [] };
    else if (path === '/customers/cus_alice/customer-portal/session')
      result = { link: 'https://test.customer.dodopayments.com/portal' };
    else throw new Error(`Unexpected provider request: ${path}`);
    return new Response(JSON.stringify(result), {
      headers: { 'content-type': 'application/json' },
    });
  };
  s = {
    db: {
      from: builder,
      rpc,
      auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    } as unknown as Services['db'],
    dodo: new DodoPayments({
      bearerToken: 'test-only',
      environment: 'test_mode',
      webhookKey,
      fetch: fetcher,
      maxRetries: 0,
    }),
    environment: 'test_mode',
    productId: 'pdt_test',
    origin: 'https://termsapply.example',
  };
  mocks.services.mockReturnValue(s);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
function request(action: string, extra: Record<string, unknown> = {}) {
  return new Request('https://termsapply.example/.netlify/functions/billing', {
    method: 'POST',
    headers: {
      origin: s.origin,
      authorization: 'Bearer authenticated-token',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action, ...extra }),
  });
}
function signedRequest(payload: unknown, { old = false, id = 'evt-one' } = {}) {
  const body = JSON.stringify(payload);
  const timestamp = new Date(Date.now() - (old ? 600000 : 0));
  return new Request(
    'https://termsapply.example/.netlify/functions/dodo-webhook',
    {
      method: 'POST',
      headers: {
        'webhook-id': id,
        'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
        'webhook-signature': new Webhook(webhookKey).sign(id, timestamp, body),
      },
      body,
    },
  );
}
describe('provider boundary', () => {
  it('only accepts the configured INR 199 monthly, tax-inclusive, no-trial product', () => {
    expect(() => validateProduct(product)).not.toThrow();
    for (const price of [
      { price: 199 },
      { currency: 'USD' },
      { tax_inclusive: false },
      { payment_frequency_interval: 'Year' },
      { trial_period_days: 7 },
      { discount_bps: 100 },
      { subscription_period_count: 1, subscription_period_interval: 'Month' },
    ])
      expect(() =>
        validateProduct({
          ...product,
          price: { ...product.price, ...price },
        } as Product),
      ).toThrow('does not match');
  });
  it('never derives identity from request data and requires a server-verified confirmed email', async () => {
    await billingHandler(
      request('portal', { user_id: 'bob', customer_id: 'cus_bob' }),
    );
    expect(s.db.auth.getUser).toHaveBeenCalledWith('authenticated-token');
    await expect(
      requireUser(new Request('https://example.com'), s.db),
    ).rejects.toThrow('Sign in');
    vi.mocked(s.db.auth.getUser).mockResolvedValueOnce({
      data: { user: { ...user, email_confirmed_at: undefined } },
      error: null,
    });
    expect(
      (await billingHandler(request('checkout', { accept_recurring: true })))
        .status,
    ).toBe(403);
    expect(providerCalls).toHaveLength(0);
  });
  it('requires explicit consent and same-origin requests before checkout', async () => {
    expect((await billingHandler(request('checkout'))).status).toBe(400);
    const req = request('checkout', { accept_recurring: true });
    req.headers.set('origin', 'https://attacker.example');
    expect((await billingHandler(req)).status).toBe(403);
    expect(providerCalls).toHaveLength(0);
  });
  it('uses server-owned product, customer and idempotency keys; reuses an unfinished checkout', async () => {
    const result = await billingHandler(
      request('checkout', {
        accept_recurring: true,
        product_id: 'cheap',
        user_id: 'bob',
        amount: 1,
      }),
    );
    expect(result.status).toBe(200);
    expect((await result.json()).url).toContain('dodopayments.com');
    const call = providerCalls.find(
      (c) => new URL(c.url).pathname === '/checkouts',
    )!;
    expect(call.body).toMatchObject({
      product_cart: [{ product_id: 'pdt_test', quantity: 1 }],
      customer: { customer_id: 'cus_alice' },
      return_url: `${s.origin}/settings?checkout=returned`,
      mandate_min_amount_inr_paise: 19900,
    });
    expect(JSON.stringify(call.body)).not.toMatch(/goal|pledge|bob|cheap/);
    expect(call.idempotency).toBe('terms-apply-checkout-request-one');
    await checkout(s, user);
    expect(
      providerCalls.filter((c) => new URL(c.url).pathname === '/checkouts'),
    ).toHaveLength(1);
  });
  it('does not unlock access from the return URL or subscription status without a successful paid period', () => {
    expect(
      receiptRows(
        { ...payment, status: 'failed', service_periods: [] },
        subscription,
      ),
    ).toEqual([]);
    expect(
      receiptRows(
        { ...payment, charge_type: null, total_amount: 0 },
        subscription,
      )[0].valid,
    ).toBe(false);
    expect(receiptRows(payment, subscription)[0].valid).toBe(true);
    for (const patch of [
      { refund_status: 'full' },
      { dispute_status: 'dispute_opened' },
      { currency: 'USD' },
      { total_amount: 0 },
      { charge_type: 'plan_change' },
      { is_multi_subscription: true },
    ])
      expect(
        receiptRows(
          { ...payment, ...patch } as PaymentListResponse,
          subscription,
        )[0].valid,
      ).toBe(false);
  });
  it('cancels only the authenticated customer subscription and preserves its paid period', async () => {
    customer = {
      user_id: 'alice',
      environment: 'test_mode',
      customer_id: 'cus_alice',
    };
    hasSubscription = true;
    const result = await billingHandler(
      request('cancel', { customer_id: 'cus_bob', subscription_id: 'sub_bob' }),
    );
    expect(result.status).toBe(200);
    expect(providerCalls.find((c) => c.method === 'PATCH')).toMatchObject({
      url: 'https://test.dodopayments.com/subscriptions/sub_alice',
      body: { cancel_at_next_billing_date: true },
    });
    expect(rpc).toHaveBeenCalledWith(
      'apply_billing_snapshot',
      expect.objectContaining({
        p_subscriptions: [
          expect.objectContaining({
            status: 'active',
            cancel_at_period_end: true,
          }),
        ],
        p_receipts: [expect.objectContaining({ valid: true })],
      }),
    );
  });
  it('stops renewal immediately before an account-deletion attempt', async () => {
    customer = {
      user_id: 'alice',
      environment: 'test_mode',
      customer_id: 'cus_alice',
    };
    hasSubscription = true;
    expect((await billingHandler(request('prepare-delete'))).status).toBe(200);
    expect(customer.deleting).toBe(true);
    expect(providerCalls.find((c) => c.method === 'PATCH')?.body).toEqual({
      status: 'cancelled',
    });
    expect(rpc).toHaveBeenCalledWith(
      'apply_billing_snapshot',
      expect.objectContaining({
        p_subscriptions: [expect.objectContaining({ status: 'cancelled' })],
      }),
    );
  });
  it('rejects unexpected redirect hosts', () => {
    for (const url of [
      'http://test.checkout.dodopayments.com',
      'https://dodopayments.com.evil.example',
      'https://user:pass@dodopayments.com',
    ])
      expect(() => providerUrl(url)).toThrow();
  });
});
describe('signed provider webhook and retries', () => {
  it('rejects unsigned, tampered and expired events without database writes', async () => {
    const event = { type: 'subscription.active', data: subscription };
    const unsigned = new Request('https://example.com', {
      method: 'POST',
      body: JSON.stringify(event),
    });
    expect((await webhookHandler(unsigned)).status).toBe(401);
    expect(
      (await webhookHandler(signedRequest(event, { old: true }))).status,
    ).toBe(401);
    const tampered = signedRequest(event);
    tampered.headers.set('webhook-signature', 'v1,invalid');
    expect((await webhookHandler(tampered)).status).toBe(401);
    expect(writes).toEqual([]);
  });
  it('verifies a signed event, fetches current provider data and deduplicates repeats', async () => {
    customer = {
      user_id: 'alice',
      environment: 'test_mode',
      customer_id: 'cus_alice',
    };
    hasSubscription = true;
    const payload = { type: 'subscription.active', data: subscription };
    expect((await webhookHandler(signedRequest(payload))).status).toBe(200);
    expect(rpc).toHaveBeenCalledWith(
      'apply_billing_snapshot',
      expect.objectContaining({
        p_user_id: 'alice',
        p_environment: 'test_mode',
        p_receipts: [
          expect.objectContaining({ valid: true, payment_id: 'pay_alice' }),
        ],
      }),
    );
    const calls = providerCalls.length;
    expect((await webhookHandler(signedRequest(payload))).status).toBe(200);
    expect(providerCalls).toHaveLength(calls);
    expect(
      writes.find((w) => w.table === 'billing_events' && w.data.processed_at),
    ).toBeTruthy();
  });
  it('returns a retryable failure and preserves diagnostic codes when persistence fails', async () => {
    customer = {
      user_id: 'alice',
      environment: 'test_mode',
      customer_id: 'cus_alice',
    };
    hasSubscription = true;
    syncFails = true;
    const payload = { type: 'payment.succeeded', data: payment };
    expect((await webhookHandler(signedRequest(payload))).status).toBe(503);
    expect(event?.processed_at).toBeUndefined();
    expect(event?.error_code).toBe('processing_failed');
    syncFails = false;
    expect((await webhookHandler(signedRequest(payload))).status).toBe(200);
    expect(event?.processed_at).toBeTruthy();
  });
});
// Keep the actual environment parser covered independently of the injection above.
it('does not silently default to live billing', async () => {
  const real = await vi.importActual<typeof import('../netlify/lib/billing')>(
    '../netlify/lib/billing',
  );
  vi.stubEnv('DODO_PAYMENTS_ENVIRONMENT', '');
  expect(() => real.billingServices()).toThrow('not available');
  expect(billingServices()).toBe(s);
});
