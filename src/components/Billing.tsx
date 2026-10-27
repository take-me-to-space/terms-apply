import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Dialog } from './ui';
import { billingAction, billingDate, useBilling } from '../lib/billing';
import { friendlyError } from '../lib/supabase';

export function Billing() {
  const { state, error: loadError, refresh } = useBilling();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [upgrade, setUpgrade] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [agreed, setAgreed] = useState(false);
  async function act(action: 'checkout' | 'portal' | 'cancel' | 'sync') {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await billingAction(action, agreed);
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      await refresh();
      setCancel(false);
      setMessage(
        action === 'cancel'
          ? 'Renewal cancelled. Plus stays available through your paid period.'
          : 'Billing refreshed. Access changes only after payment is confirmed.',
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      !state?.enabled ||
      !state.has_customer ||
      !new URLSearchParams(location.search).has('checkout')
    )
      return;
    // A return URL is only a prompt to check with the server; it never unlocks access.
    void act('sync');
    window.history.replaceState(null, '', '/settings');
    // Run once on the first loaded billing state after returning from the provider.
  }, [state?.enabled, state?.has_customer]);
  if (loadError) return <Alert>{loadError}</Alert>;
  if (!state || (!state.enabled && !state.has_customer)) return null;
  return (
    <section className="billing-section" aria-labelledby="billing-heading">
      <div className="billing-heading">
        <div>
          <p className="eyebrow">Your plan</p>
          <h2 id="billing-heading">
            {state.paid ? 'Terms Apply Plus' : 'Free'}
          </h2>
        </div>
        <p className="billing-price">{state.paid ? '₹99 / month' : '₹0'}</p>
      </div>
      {state.test_mode && (
        <p className="quiet-banner">
          Test checkout. No real payments. Use Dodo’s test payment details.
        </p>
      )}
      {(error || loadError) && <Alert>{error || loadError}</Alert>}
      {message && <Alert success>{message}</Alert>}
      {state.paid ? (
        <p>
          Unlimited new commitments. Paid access through{' '}
          {billingDate(state.paid_until!)}.
          {state.cancelling
            ? ' Renewal is cancelled.'
            : state.renewing
              ? ' Your subscription renews monthly until cancelled.'
              : ''}
        </p>
      ) : (
        <p>
          {Math.max(0, state.limit - state.used)} of {state.limit} new
          commitments left this month. Resets {billingDate(state.resets_at)}.
        </p>
      )}
      {state.payment_issue && (
        <p className="field-error">
          A subscription payment needs attention. Open Manage billing to check
          it.
        </p>
      )}
      <p className="field-hint">
        Reminders, reports, and existing records stay available on either plan.
        Only confirmed commitments count; withdrawals don’t restore the
        allowance. The free allowance resets at the start of each month in UTC.
      </p>
      <div className="form-actions billing-actions">
        {state.enabled &&
          !state.paid &&
          !state.renewing &&
          !state.cancelling && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => {
                setUpgrade(true);
                setAgreed(false);
              }}
            >
              Plus · ₹99/month
            </button>
          )}
        {state.has_customer && (
          <>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void act('portal')}
            >
              Manage billing
            </button>
            <button
              className="text-link"
              disabled={busy}
              onClick={() => void act('sync')}
            >
              {busy ? 'Updating…' : 'Refresh billing'}
            </button>
          </>
        )}
        {state.renewing && (
          <button
            className="text-link"
            disabled={busy}
            onClick={() => setCancel(true)}
          >
            Cancel renewal
          </button>
        )}
      </div>
      <p className="fine-print">
        <Link to="/privacy#billing">Billing, cancellation & privacy</Link>
      </p>
      {upgrade && (
        <Dialog
          title="Terms Apply Plus"
          onClose={() => {
            if (!busy) setUpgrade(false);
          }}
        >
          <div className="stack">
            <p className="billing-price">₹99 / month</p>
            <p>
              Unlimited new commitments. Your reminders and check-ins work the
              same way.
            </p>
            <p>
              ₹99 is charged now and each month until you cancel. Taxes are
              included. Cancel renewal in Account; access lasts through the
              period you paid for. Your pledge never creates a charge.
            </p>
            <p className="field-hint">
              Checkout and billing are handled by Dodo Payments. See{' '}
              <Link to="/privacy#billing">cancellation and refund terms</Link>{' '}
              before continuing.
            </p>
            {state.test_mode && (
              <p>This is a test checkout. No real payment will be taken.</p>
            )}
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
              />
              <span>
                I agree to ₹99 monthly recurring billing until I cancel.
              </span>
            </label>
            {error && <Alert>{error}</Alert>}
            <button
              className="button primary"
              disabled={!agreed || busy}
              onClick={() => void act('checkout')}
            >
              {busy ? 'Opening checkout…' : 'Continue to Dodo'}
            </button>
          </div>
        </Dialog>
      )}
      {cancel && (
        <Dialog
          title="Cancel renewal?"
          onClose={() => {
            if (!busy) setCancel(false);
          }}
        >
          <div className="stack">
            <p>
              You won’t be charged for another billing period. Plus remains
              available for the period already paid for. Afterwards, the free
              monthly allowance applies. Your records and check-ins remain
              accessible.
            </p>
            {error && <Alert>{error}</Alert>}
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void act('cancel')}
            >
              {busy ? 'Cancelling…' : 'Cancel renewal'}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
export function Allowance() {
  const { state } = useBilling();
  if (!state?.enabled || state.paid) return null;
  return (
    <p className="quiet-banner">
      {Math.max(0, state.limit - state.used)} of {state.limit} new commitments
      left this month. Resets {billingDate(state.resets_at)}.{' '}
      <Link to="/settings">View your plan</Link>
    </p>
  );
}
