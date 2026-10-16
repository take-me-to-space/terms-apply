import { useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LockKeyhole,
  RotateCcw,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, Mark, PageIntro } from '../components/ui';
import { useAuth } from '../lib/auth';
import { client, friendlyError, remindersAvailable } from '../lib/supabase';
import {
  deviceTimezone,
  draftSchema,
  formatDate,
  localInput,
  localToISO,
  type Draft,
} from '../lib/model';

const storageKey = 'terms-apply:unsigned-draft';
function requestId(): string {
  try {
    const existing = sessionStorage.getItem(`${storageKey}:id`);
    if (existing) return existing;
  } catch {
    /* Use in-memory key. */
  }
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem(`${storageKey}:id`, id);
  } catch {
    /* Noncritical. */
  }
  return id;
}
const emptyDraft = (): Draft => ({
  goal: '',
  doneMeans: '',
  deadline: '',
  pledge: '',
  pledgeCheck: '',
  timezone: deviceTimezone(),
});
function readDraft(): Draft {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (
      saved &&
      ['goal', 'doneMeans', 'deadline', 'pledge', 'pledgeCheck'].every(
        (k) => typeof saved[k] === 'string',
      )
    )
      return { ...saved, timezone: deviceTimezone() };
  } catch {
    /* Storage may be unavailable. */
  }
  return emptyDraft();
}
function store(draft: Draft) {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    /* Unsaved drafts can still be used. */
  }
}
export function Composer() {
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [review, setReview] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmationId, setConfirmationId] = useState(requestId);
  const { session } = useAuth();
  const navigate = useNavigate();
  function renewId() {
    const id = crypto.randomUUID();
    setConfirmationId(id);
    try {
      sessionStorage.setItem(`${storageKey}:id`, id);
    } catch {
      /* Noncritical. */
    }
  }
  function change(key: keyof Draft, value: string) {
    const next = { ...draft, [key]: value };
    setDraft(next);
    store(next);
    renewId();
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }
  function example() {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 1);
    deadline.setHours(20, 0, 0, 0);
    const check = new Date(deadline);
    check.setDate(check.getDate() + 2);
    check.setHours(23, 0, 0, 0);
    const next = {
      goal: 'Walk for 30 minutes',
      doneMeans: 'Spend 30 minutes walking outside.',
      deadline: localInput(deadline),
      pledge: 'Give up Netflix for the next two evenings.',
      pledgeCheck: localInput(check),
      timezone: deviceTimezone(),
    };
    setDraft(next);
    store(next);
    renewId();
    setErrors({});
  }
  function toReview(e: FormEvent) {
    e.preventDefault();
    setError('');
    const result = draftSchema.safeParse(draft);
    if (!result.success) {
      const fields: Record<string, string> = {};
      result.error.issues.forEach((i) => {
        fields[String(i.path[0])] = i.message;
      });
      setErrors(fields);
      return;
    }
    setDraft(result.data);
    store(result.data);
    setReview(true);
    window.scrollTo(0, 0);
  }
  async function confirm() {
    if (!agreed || busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error } = await client().rpc('create_commitment', {
        p_goal: draft.goal,
        p_done_means: draft.doneMeans,
        p_deadline_at: localToISO(draft.deadline),
        p_pledge: draft.pledge,
        p_pledge_check_at: localToISO(draft.pledgeCheck),
        p_timezone: draft.timezone,
        p_request_id: confirmationId,
      });
      if (error) throw error;
      try {
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem(`${storageKey}:id`);
      } catch {
        /* Noncritical. */
      }
      navigate(`/commitments/${data}`, { replace: true });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  const fieldError = (key: string) =>
    errors[key] && (
      <span id={`error-${key}`} className="field-error" role="alert">
        {errors[key]}
      </span>
    );
  return (
    <section className="wrap composer-page">
      <Link className="back-link" to={session ? '/app' : '/'}>
        <ArrowLeft size={15} />{' '}
        {session ? 'My commitments' : 'Back to the idea'}
      </Link>
      <div className="composer-heading">
        <PageIntro
          eyebrow="A PERSONAL AGREEMENT"
          title={review ? 'Read your fine print.' : 'What’s the thing?'}
        >
          <p>
            {review
              ? 'All your terms, together. Change anything before you make it official.'
              : 'One concrete thing. A real deadline. Terms you choose yourself.'}
          </p>
        </PageIntro>
        <div className="step-indicator">
          <span className={!review ? 'active' : 'complete'}>
            {review ? <Check size={13} /> : '1'}
          </span>
          <span>Write</span>
          <i />
          <span className={review ? 'active' : ''}>2</span>
          <span>Review</span>
        </div>
      </div>
      <div className="composer-grid">
        <div>
          {error && <Alert>{error}</Alert>}
          {!review ? (
            <form className="composer-form" onSubmit={toReview} noValidate>
              <div className="form-section">
                <span className="form-number">01</span>
                <div>
                  <label htmlFor="goal">What will you do?</label>
                  <p className="field-hint">
                    Something you can finish, ideally in the next day or two.
                  </p>
                  <input
                    id="goal"
                    value={draft.goal}
                    onChange={(e) => change('goal', e.target.value)}
                    maxLength={180}
                    placeholder="Walk for 30 minutes"
                    aria-invalid={Boolean(errors.goal)}
                    aria-describedby={errors.goal ? 'error-goal' : undefined}
                    required
                  />
                  {fieldError('goal')}
                </div>
              </div>
              <div className="form-section">
                <span className="form-number">02</span>
                <div>
                  <label htmlFor="done-means">What counts as done?</label>
                  <p className="field-hint">
                    Give future-you something specific to check against.
                  </p>
                  <textarea
                    id="done-means"
                    rows={3}
                    value={draft.doneMeans}
                    onChange={(e) => change('doneMeans', e.target.value)}
                    maxLength={700}
                    placeholder="Spend 30 minutes walking outside."
                    aria-invalid={Boolean(errors.doneMeans)}
                    aria-describedby={
                      errors.doneMeans ? 'error-doneMeans' : undefined
                    }
                    required
                  />
                  {fieldError('doneMeans')}
                </div>
              </div>
              <div className="form-section">
                <span className="form-number">03</span>
                <div>
                  <label htmlFor="deadline">By when?</label>
                  <p className="field-hint">
                    A finish line, rather than a vague “soon.”
                  </p>
                  <input
                    id="deadline"
                    type="datetime-local"
                    value={draft.deadline}
                    onChange={(e) => change('deadline', e.target.value)}
                    aria-invalid={Boolean(errors.deadline)}
                    aria-describedby={
                      errors.deadline ? 'error-deadline' : undefined
                    }
                    required
                  />
                  {fieldError('deadline')}
                  <span className="field-hint timezone">
                    Times in {draft.timezone.replaceAll('_', ' ')}. Stored with
                    the correct UTC offset.
                  </span>
                </div>
              </div>
              <div className="form-section pledge-section">
                <span className="form-number">04</span>
                <div>
                  <label htmlFor="pledge">Your pledge, if missed.</label>
                  <p className="field-hint">
                    Something meaningful, manageable, and additional to your
                    usual obligations. No need to go overboard.
                  </p>
                  <textarea
                    id="pledge"
                    rows={3}
                    value={draft.pledge}
                    onChange={(e) => change('pledge', e.target.value)}
                    maxLength={700}
                    placeholder="Give up Netflix for the next two evenings."
                    aria-invalid={Boolean(errors.pledge)}
                    aria-describedby={
                      errors.pledge ? 'error-pledge' : undefined
                    }
                    required
                  />
                  {fieldError('pledge')}
                </div>
              </div>
              <div className="form-section">
                <span className="form-number">05</span>
                <div>
                  <label htmlFor="pledge-check">
                    When can you report on your pledge?
                  </label>
                  <p className="field-hint">
                    Leave time to do it. Two Netflix-free evenings need two
                    evenings, for example.
                  </p>
                  <input
                    id="pledge-check"
                    type="datetime-local"
                    value={draft.pledgeCheck}
                    onChange={(e) => change('pledgeCheck', e.target.value)}
                    aria-invalid={Boolean(errors.pledgeCheck)}
                    aria-describedby={
                      errors.pledgeCheck ? 'error-pledgeCheck' : undefined
                    }
                    required
                  />
                  {fieldError('pledgeCheck')}
                </div>
              </div>
              <div className="form-actions">
                <button
                  type="button"
                  className="text-link"
                  onClick={() => {
                    setDraft(emptyDraft());
                    store(emptyDraft());
                    setErrors({});
                  }}
                >
                  <RotateCcw size={14} /> Start over
                </button>
                <button className="button primary" type="submit">
                  Review my terms <ArrowRight size={18} />
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="agreement-sheet">
                <div className="paper-top">
                  <span>YOUR ORIGINAL TERMS</span>
                  <Mark size={28} />
                </div>
                <p className="paper-prefix">I’m going to</p>
                <h2>{draft.goal}</h2>
                <dl className="terms-list">
                  <div>
                    <dt>DONE MEANS</dt>
                    <dd>{draft.doneMeans}</dd>
                  </div>
                  <div>
                    <dt>BY WHEN</dt>
                    <dd>
                      {formatDate(
                        localToISO(draft.deadline),
                        draft.timezone,
                        true,
                      )}
                    </dd>
                  </div>
                  <div className="pledge-term">
                    <dt>MY PLEDGE, IF MISSED</dt>
                    <dd>{draft.pledge}</dd>
                  </div>
                  <div>
                    <dt>PLEDGE CHECK-IN</dt>
                    <dd>
                      {formatDate(
                        localToISO(draft.pledgeCheck),
                        draft.timezone,
                        true,
                      )}
                    </dd>
                  </div>
                </dl>
                <p className="fine-print">
                  All times in {draft.timezone}. Completing late triggers the
                  pledge too.
                </p>
              </div>
              <div className="confirmation-block">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <span>
                    These are my terms. I understand the confirmed version stays
                    in my record, and all outcomes are self-reported.
                  </span>
                </label>
                <div className="form-actions">
                  <button
                    className="text-link"
                    onClick={() => {
                      setReview(false);
                      setAgreed(false);
                    }}
                  >
                    <ArrowLeft size={15} /> Edit my terms
                  </button>
                  {session ? (
                    <button
                      className="button primary"
                      disabled={!agreed || busy}
                      onClick={confirm}
                    >
                      {busy ? 'Confirming…' : 'Make it official'}
                      <Check size={18} />
                    </button>
                  ) : (
                    <Link
                      className={`button primary ${!agreed ? 'disabled-link' : ''}`}
                      aria-disabled={!agreed}
                      onClick={(e) => {
                        if (!agreed) e.preventDefault();
                      }}
                      to="/auth?mode=signup&next=/new"
                    >
                      Create account to confirm <ArrowRight size={17} />
                    </Link>
                  )}
                </div>
                {!session && (
                  <p className="fine-print">
                    Your unsigned draft stays in this browser tab while you
                    create an account. You’ll review it again before saving.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <aside className="composer-aside">
          <div className="margin-note">
            <Mark size={30} />
            <h3>
              Small is a<br />
              <em>perfectly good start.</em>
            </h3>
            <p>
              A 30-minute walk is easier to call done than “get my life
              together.” Start there.
            </p>
            {!review && (
              <button type="button" className="text-link" onClick={example}>
                Borrow the walking example <ArrowRight size={15} />
              </button>
            )}
          </div>
          <div className="aside-facts">
            <p>
              <LockKeyhole size={16} /> Private from other users.
            </p>
            <p>
              <Check size={16} /> Your pledge. Never assigned.
            </p>
            <p>
              <Check size={16} /> No automatic charges or penalties.
            </p>
          </div>
          <p className="fine-print">
            {remindersAvailable
              ? 'Email reminders are optional. Turn them on in Account; nothing is sent without your opt-in.'
              : 'Email reminders are not available yet. Keep your own reminder until the operator enables delivery.'}
          </p>
        </aside>
      </div>
    </section>
  );
}
