import { schedule } from '@netlify/functions';
import { billingServices, syncCustomer, type Customer } from '../lib/billing';
export async function reconcileBilling() {
  if (!process.env.DODO_PAYMENTS_API_KEY)
    return { statusCode: 200, body: 'Billing not enabled.' };
  try {
    const s = billingServices();
    const { data, error } = await s.db
      .from('billing_customers')
      .select('*')
      .eq('environment', s.environment)
      .not('customer_id', 'is', null)
      .order('synced_at', { ascending: true, nullsFirst: true })
      .limit(3);
    if (error) throw new Error('lookup_failed');
    let failed = 0;
    await Promise.all(
      (data || []).map(async (c: Customer) => {
        try {
          await syncCustomer(s, c);
        } catch {
          failed++;
          await s.db
            .from('billing_customers')
            .update({
              sync_error: 'reconciliation_failed',
              synced_at: new Date().toISOString(),
            })
            .eq('user_id', c.user_id)
            .eq('environment', s.environment);
        }
      }),
    );
    console.info('billing_reconcile', { checked: data?.length || 0, failed });
    return {
      statusCode: failed ? 502 : 200,
      body: JSON.stringify({ checked: data?.length || 0, failed }),
    };
  } catch {
    console.error('billing_reconcile_failed');
    return { statusCode: 503, body: 'Billing reconciliation failed.' };
  }
}
export const handler = schedule('*/5 * * * *', reconcileBilling);
