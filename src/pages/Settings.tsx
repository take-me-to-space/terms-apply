import { useEffect, useState, type FormEvent } from 'react';
import { Bell, Download, LogOut, Trash2 } from 'lucide-react';
import { Alert, Dialog, PageIntro } from '../components/ui';
import { Billing } from '../components/Billing';
import { supportEmail } from '../lib/support';
import { billingAction } from '../lib/billing';
import { useAuth } from '../lib/auth';
import {
  client,
  friendlyError,
  getCommitments,
  remindersAvailable,
} from '../lib/supabase';
function leaveAccount() {
  try {
    sessionStorage.removeItem('terms-apply:unsigned-draft');
    sessionStorage.removeItem('terms-apply:unsigned-draft:id');
  } catch {
    /* Storage can be disabled. */
  }
  // Clear all in-memory private screen state and avoid a race with the route guard.
  window.location.replace('/');
}
export function Settings() {
  const { session } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    void client()
      .from('preferences')
      .select('reminders_enabled')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setError(friendlyError(error));
        else {
          setEnabled(data?.reminders_enabled || false);
          setLoaded(true);
        }
      });
  }, []);
  async function reminders() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { error } = await client().rpc('set_reminders', {
        p_enabled: !enabled,
      });
      if (error) throw error;
      setEnabled(!enabled);
      setMessage(
        enabled
          ? 'Email reminders turned off.'
          : 'Email reminders turned on. Only upcoming, relevant messages will be sent.',
      );
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    setBusy(true);
    setError('');
    try {
      const { error } = await client().auth.signOut();
      if (error) throw error;
      leaveAccount();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function exportData() {
    setBusy(true);
    setError('');
    try {
      const records = await getCommitments();
      const blob = new Blob(
        [
          JSON.stringify(
            {
              exported_at: new Date().toISOString(),
              email: session?.user.email,
              reminders_enabled: enabled,
              commitments: records,
            },
            null,
            2,
          ),
        ],
        { type: 'application/json' },
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'terms-apply-record.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function deleteAccount(e: FormEvent) {
    e.preventDefault();
    if (confirmation !== 'DELETE' || !session?.user.email) return;
    setBusy(true);
    setError('');
    try {
      const { error: authError } = await client().auth.signInWithPassword({
        email: session.user.email,
        password,
      });
      if (authError) throw authError;
      const { data: billing } = await client().rpc('get_billing_state');
      if (billing?.has_customer) await billingAction('prepare-delete');
      const { error } = await client().rpc('delete_my_account');
      if (error) throw error;
      await client().auth.signOut({ scope: 'local' });
      leaveAccount();
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="wrap settings-page">
      <PageIntro title="Account settings">
        <p>Manage reminders, download your records, or delete your account.</p>
      </PageIntro>
      {error && <Alert>{error}</Alert>}
      {message && <Alert success>{message}</Alert>}
      <section className="settings-section">
        <div>
          <p className="eyebrow">Signed in as</p>
          <h2 className="account-email">{session?.user.email}</h2>
          <p>
            Sign out on shared devices. Your saved agreements stay with your
            account.
          </p>
        </div>
        <button className="button secondary" onClick={signOut} disabled={busy}>
          <LogOut size={17} /> Sign out
        </button>
      </section>
      <Billing />
      <section className="settings-section">
        <div>
          <Bell size={24} />
          <h2>Email reminders</h2>
          <p>
            One reminder about two hours before the deadline, a goal check-in
            afterwards, and a pledge check-in when relevant.
          </p>
          <p className="field-hint">
            {remindersAvailable
              ? 'Email delivery can be delayed or fail. Your deadline remains the same.'
              : 'Delivery is not available yet. You can opt out below if you previously enabled reminders. Please keep your own reminder for now.'}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          className={`toggle ${enabled ? 'on' : ''}`}
          disabled={busy || !loaded || (!remindersAvailable && !enabled)}
          onClick={reminders}
          aria-label="Email reminders"
        >
          <span />
          <strong>{enabled ? 'On' : 'Off'}</strong>
        </button>
      </section>
      <section className="settings-section">
        <div>
          <Download size={24} />
          <h2>Download your records</h2>
          <p>
            Download your agreements, reports, timestamps, and notes as a JSON
            file. Store it somewhere private.
          </p>
        </div>
        <button
          className="button secondary"
          onClick={exportData}
          disabled={busy}
        >
          Download my record
        </button>
      </section>
      <section className="settings-section delete-section">
        <div>
          <Trash2 size={24} />
          <h2>Delete your account</h2>
          <p>
            Delete your account and its agreements, reports, preferences, and
            pending reminders. This is permanent. Download your record first if
            you want to keep it.
          </p>
          <p className="field-hint">
            Billing and tax records held by Dodo Payments, email provider logs,
            and database backups may persist under their retention policies.
            Already-sent email cannot be recalled. If billing prevents deletion,
            request help at {supportEmail}.
          </p>
        </div>
        <button
          className="text-link danger-text"
          onClick={() => {
            setDeleting(true);
            setError('');
          }}
          disabled={busy}
        >
          Delete my account
        </button>
      </section>
      {deleting && (
        <Dialog
          title="Delete your account?"
          onClose={() => {
            if (!busy) setDeleting(false);
          }}
        >
          <form className="stack" onSubmit={deleteAccount}>
            <p>
              This permanently deletes your account and app records. Any active
              subscription will be cancelled immediately before deletion;
              remaining paid access will end. This cannot be undone. An
              unfinished checkout may need to be closed by support first.
            </p>
            {error && <Alert>{error}</Alert>}
            <label>
              Your password
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Type DELETE to confirm
              <input
                autoComplete="off"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
                pattern="DELETE"
              />
            </label>
            <button
              className="button danger full"
              disabled={busy || confirmation !== 'DELETE'}
            >
              {busy ? 'Deleting…' : 'Permanently delete my account'}
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
