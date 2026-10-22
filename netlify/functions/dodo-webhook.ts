import {
  billingServices,
  syncCustomer,
  BillingError,
  json,
  failure,
  type Customer,
} from '../lib/billing';

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!process.env.DODO_PAYMENTS_WEBHOOK_KEY)
    return json({ error: 'Webhook not configured.' }, 503);
  if (Number(request.headers.get('content-length') || 0) > 262144)
    return json({ error: 'Payload too large.' }, 413);
  try {
    const s = billingServices();
    const body = await request.text();
    if (body.length > 262144) return json({ error: 'Payload too large.' }, 413);
    let event;
    try {
      event = s.dodo.webhooks.unwrap(body, {
        headers: Object.fromEntries(request.headers.entries()),
      });
    } catch {
      return json({ error: 'Invalid signature.' }, 401);
    }
    const eventId = request.headers.get('webhook-id');
    if (!eventId || !event?.type)
      throw new BillingError('Missing event ID.', 400);
    const { error: insertError } = await s.db
      .from('billing_events')
      .upsert(
        {
          environment: s.environment,
          event_id: eventId,
          event_type: event.type,
        },
        { onConflict: 'environment,event_id', ignoreDuplicates: true },
      );
    if (insertError) throw new BillingError('Could not record event.');
    const { data: record, error: readError } = await s.db
      .from('billing_events')
      .select('processed_at,attempts')
      .eq('environment', s.environment)
      .eq('event_id', eventId)
      .single();
    if (readError || !record) throw new BillingError('Could not read event.');
    if (record.processed_at) return json({ received: true });
    try {
      let customerId: string | undefined;
      if (
        event.type.startsWith('subscription.') ||
        event.type.startsWith('payment.')
      ) {
        const data = event.data as { customer?: { customer_id?: string } };
        customerId = data.customer?.customer_id;
      } else if (
        event.type.startsWith('refund.') ||
        event.type.startsWith('dispute.')
      ) {
        const data = event.data as { payment_id?: string };
        if (data.payment_id)
          customerId = (await s.dodo.payments.retrieve(data.payment_id))
            .customer.customer_id;
      }
      if (customerId) {
        const { data, error } = await s.db
          .from('billing_customers')
          .select('*')
          .eq('environment', s.environment)
          .eq('customer_id', customerId)
          .maybeSingle();
        if (error) throw new BillingError('Could not find billing account.');
        if (data) await syncCustomer(s, data as Customer);
      }
      const { error } = await s.db
        .from('billing_events')
        .update({
          processed_at: new Date().toISOString(),
          error_code: null,
          attempts: record.attempts + 1,
        })
        .eq('environment', s.environment)
        .eq('event_id', eventId);
      if (error) throw new BillingError('Could not finish event.');
      console.info('billing_webhook_processed', { type: event.type });
      return json({ received: true });
    } catch (error) {
      await s.db
        .from('billing_events')
        .update({
          error_code: 'processing_failed',
          attempts: record.attempts + 1,
        })
        .eq('environment', s.environment)
        .eq('event_id', eventId);
      throw error;
    }
  } catch (error) {
    return failure(error, 'billing_webhook_failed');
  }
};
