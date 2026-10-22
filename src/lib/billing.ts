import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { client, friendlyError } from './supabase';
export type BillingState = {
  enabled: boolean;
  test_mode: boolean;
  paid: boolean;
  paid_until: string | null;
  used: number;
  limit: number;
  resets_at: string;
  has_customer: boolean;
  renewing: boolean;
  cancelling: boolean;
  payment_issue: boolean;
};
export async function billingAction(
  action: 'checkout' | 'portal' | 'cancel' | 'sync' | 'prepare-delete',
  acceptRecurring = false,
) {
  const { data } = await client().auth.getSession();
  if (!data.session) throw new Error('Sign in to manage billing.');
  const response = await fetch('/.netlify/functions/billing', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${data.session.access_token}`,
    },
    body: JSON.stringify({ action, accept_recurring: acceptRecurring }),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error(
      'Billing is not available right now. Please try again later.',
    );
  }
  if (!response.ok)
    throw new Error(result.error || 'Could not update billing.');
  return result as { url?: string; updated?: boolean };
}
export function useBilling() {
  const { session } = useAuth();
  const [state, setState] = useState<BillingState | null>(null);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    if (!session) return;
    const { data, error } = await client().rpc('get_billing_state');
    if (error) {
      // An older database can continue serving the app while the additive migration is installed.
      if (error.code !== 'PGRST202') setError(friendlyError(error));
      return;
    }
    setError('');
    setState(data as BillingState);
  }, [session]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { state, error, refresh };
}
export function billingDate(value: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
