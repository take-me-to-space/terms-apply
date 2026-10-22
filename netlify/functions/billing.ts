import {
  billingServices,
  requireUser,
  checkout,
  customerFor,
  syncCustomer,
  cancelSubscriptions,
  providerUrl,
  BillingError,
  json,
  failure,
} from '../lib/billing';

export default async (request: Request) => {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  try {
    const s = billingServices();
    if (request.headers.get('origin') !== s.origin)
      throw new BillingError('Open billing from Terms Apply.', 403);
    const user = await requireUser(request, s.db);
    const body = await request.json();
    const action = body?.action;
    if (action === 'checkout') {
      if (body.accept_recurring !== true)
        throw new BillingError(
          'Agree to monthly recurring billing before checkout.',
          400,
        );
      return json({ url: await checkout(s, user) });
    }
    const customer = await customerFor(s, user.id);
    if (!customer) return json({ updated: true });
    // Management remains available when sales are paused. Identity is always server-verified.
    if (action === 'sync') await syncCustomer(s, customer);
    else if (action === 'portal') {
      if (!customer.customer_id)
        throw new BillingError('There is no billing account yet.', 409);
      return json({
        url: providerUrl(
          (
            await s.dodo.customers.customerPortal.create(customer.customer_id, {
              return_url: `${s.origin}/settings`,
              send_email: false,
            })
          ).link,
        ),
      });
    } else if (action === 'cancel') await cancelSubscriptions(s, customer);
    else if (action === 'prepare-delete') {
      const { error } = await s.db
        .from('billing_customers')
        .update({ deleting: true })
        .eq('user_id', user.id);
      if (error)
        throw new BillingError('Could not close billing. Please try again.');
      await cancelSubscriptions(s, customer, true);
      // The database still blocks deletion while any checkout could accept payment.
    } else throw new BillingError('Unknown billing action.', 400);
    return json({ updated: true });
  } catch (error) {
    return failure(error, 'billing_request_failed');
  }
};
