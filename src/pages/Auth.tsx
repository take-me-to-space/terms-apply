import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Mail } from 'lucide-react';
import { Alert, PageIntro } from '../components/ui';
import { useAuth } from '../lib/auth';
import { client, configured, friendlyError } from '../lib/supabase';

export function Auth() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState<'signin' | 'signup' | 'recover'>(
    params.get('mode') === 'signup' ? 'signup' : 'signin',
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const { session, recovery } = useAuth();
  const navigate = useNavigate();
  const next = params.get('next') === '/new' ? '/new' : '/app';
  useEffect(() => {
    if (params.has('error') || params.has('error_description'))
      setError(
        'This sign-in link could not be used. Request a fresh link and try again.',
      );
  }, [params]);
  if (recovery) return <Navigate to="/reset-password" replace />;
  if (session) return <Navigate to={next} replace />;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const auth = client().auth;
      if (mode === 'recover') {
        const { error } = await auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setMessage(
          'If an account uses that email, a reset link is on its way. Check your spam folder too.',
        );
      } else if (mode === 'signup') {
        const { data, error } = await auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth?next=${next}`,
          },
        });
        if (error) throw error;
        if (data.session) navigate(next);
        else
          setMessage(
            'Check your email to confirm your account. Open the link in this browser, then come back to your agreement.',
          );
      } else {
        const { error } = await auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        navigate(next);
      }
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const changeMode = (m: typeof mode) => {
    setMode(m);
    setMessage('');
    setError('');
    setPassword('');
  };
  return (
    <section className="auth-layout wrap">
      <div className="auth-aside">
        <p className="eyebrow">SOME THINGS ARE WORTH WRITING DOWN</p>
        <h2>
          Your word.
          <br />
          <em>In one place.</em>
        </h2>
        <p>
          Private commitments. Honest check-ins.
          <br />A record that sticks around.
        </p>
        <div className="aside-note">
          <span>NOTE TO SELF</span>
          <p>
            “I’ll do it tomorrow”
            <br />
            has had a pretty good run.
          </p>
        </div>
      </div>
      <div className="auth-card">
        <PageIntro
          eyebrow="TERMS APPLY"
          title={
            mode === 'signup'
              ? 'Make yourself a deal.'
              : mode === 'recover'
                ? 'Lost the password?'
                : 'Good to have you back.'
          }
        >
          <p>
            {mode === 'signup'
              ? 'An account keeps your agreements safe and available on your other devices.'
              : mode === 'recover'
                ? 'We’ll email you a link to set a new one.'
                : 'Your agreements are right where you left them.'}
          </p>
        </PageIntro>
        {!configured && (
          <Alert>
            Accounts are not connected yet. You can{' '}
            <Link to="/new">write and review an agreement</Link>, but saving
            needs the operator to finish account setup.
          </Alert>
        )}
        {error && <Alert>{error}</Alert>}
        {message && (
          <Alert success>
            <Mail size={19} /> {message}
          </Alert>
        )}
        <form onSubmit={submit} className="stack">
          <label>
            Email address
            <input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              maxLength={254}
              placeholder="you@somewhere.com"
            />
          </label>
          {mode !== 'recover' && (
            <label>
              Password
              <input
                aria-label="Password"
                aria-describedby={
                  mode === 'signup' ? 'password-hint' : undefined
                }
                type="password"
                autoComplete={
                  mode === 'signup' ? 'new-password' : 'current-password'
                }
                minLength={mode === 'signup' ? 12 : undefined}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === 'signup' ? 'At least 12 characters' : 'Your password'
                }
              />
              {mode === 'signup' && (
                <span id="password-hint" className="field-hint">
                  12 characters or more. A short sentence works well.
                </span>
              )}
            </label>
          )}
          {mode === 'signin' && (
            <button
              className="text-link align-right"
              type="button"
              onClick={() => changeMode('recover')}
            >
              Forgot your password?
            </button>
          )}
          <button
            className="button primary full"
            disabled={busy || !configured}
          >
            {busy
              ? 'One moment…'
              : mode === 'signup'
                ? 'Create account'
                : mode === 'recover'
                  ? 'Send reset link'
                  : 'Sign in'}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="auth-switch">
          {mode === 'signin' ? (
            <>
              New here?{' '}
              <button
                className="text-link"
                onClick={() => changeMode('signup')}
              >
                Create an account
              </button>
            </>
          ) : (
            <button className="text-link" onClick={() => changeMode('signin')}>
              Back to sign in
            </button>
          )}
        </p>
        <p className="fine-print">
          By using Terms Apply, you agree to the{' '}
          <Link to="/privacy">privacy notice and terms</Link>. Your records are
          private from other users.
        </p>
      </div>
    </section>
  );
}

export function ResetPassword() {
  const { session, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const { error } = await client().auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="narrow wrap">
      <PageIntro eyebrow="ACCOUNT RECOVERY" title="A fresh password." />
      <div className="panel">
        {error && <Alert>{error}</Alert>}
        {done ? (
          <>
            <Alert success>Password updated.</Alert>
            <Link className="button primary" to="/app">
              Back to your commitments <ArrowRight size={17} />
            </Link>
          </>
        ) : loading ? (
          <p>Checking your recovery link…</p>
        ) : session ? (
          <form className="stack" onSubmit={submit}>
            <label>
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Repeat new password
              <input
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        ) : (
          <>
            <Alert>
              This recovery link has expired or could not be used in this
              browser.
            </Alert>
            <Link to="/auth">Request a new link</Link>
          </>
        )}
      </div>
    </section>
  );
}
