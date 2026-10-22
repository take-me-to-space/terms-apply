import { Allowance } from '../components/Billing';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Check, RotateCcw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Alert, PageIntro } from '../components/ui';
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
  useEffect(() => {
    if (review)
      document.querySelector<HTMLElement>('.composer-heading h1')?.focus();
  }, [review]);
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
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      });
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
  function draftDate(value: string) {
    try {
      return formatDate(localToISO(value), draft.timezone, true);
    } catch {
      return 'Choose a date and time';
    }
  }
  return (
    <section className="wrap composer-page">
      <Link className="back-link" to={session ? '/app' : '/'}>
        <ArrowLeft size={15} />{' '}
        {session ? 'My commitments' : 'About Terms Apply'}
      </Link>
      <div className="composer-heading">
        <PageIntro title={review ? 'Review your terms' : 'New commitment'}>
          <p>
            {review
              ? 'Check the whole agreement before confirming.'
              : 'Set the terms. You’ll review them before confirming.'}
          </p>
        </PageIntro>
        <ol className="step-indicator" aria-label="Progress">
          <li
            className={!review ? 'active' : ''}
            aria-current={!review ? 'step' : undefined}
          >
            <span>01</span> Write
          </li>
          <li
            className={review ? 'active' : ''}
            aria-current={review ? 'step' : undefined}
          >
            <span>02</span> Review
          </li>
        </ol>
      </div>
      {!review && (
        <button
          type="button"
          className="text-link example-link"
          onClick={example}
        >
          Use the walking example <ArrowRight size={15} aria-hidden="true" />
        </button>
      )}
      <Allowance />
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
                    One task, ideally something you can finish in the next day
                    or two.
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
                  <textarea
                    id="done-means"
                    rows={2}
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
                    Times in {draft.timezone.replaceAll('_', ' ')}.
                  </span>
                </div>
              </div>
              <div className="form-section pledge-section">
                <span className="form-number">04</span>
                <div>
                  <label htmlFor="pledge">Your pledge, if missed</label>
                  <p className="field-hint">
                    Something manageable, beyond what you already need to do.
                  </p>
                  <textarea
                    id="pledge"
                    rows={2}
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
                    Leave enough time to carry it out. Two evenings without
                    Netflix need two evenings.
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
                    renewId();
                  }}
                >
                  <RotateCcw size={14} /> Start over
                </button>
                <button className="button primary" type="submit">
                  Review terms <ArrowRight size={18} />
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="agreement-sheet">
                <div className="paper-top">
                  <span>Your agreement</span>
                  <span className="document-label">Review copy</span>
                </div>
                <h2>{draft.goal}</h2>
                <dl className="terms-list">
                  <div>
                    <dt>Done means</dt>
                    <dd>{draft.doneMeans}</dd>
                  </div>
                  <div>
                    <dt>Deadline</dt>
                    <dd>
                      {formatDate(
                        localToISO(draft.deadline),
                        draft.timezone,
                        true,
                      )}
                    </dd>
                  </div>
                  <div className="pledge-term">
                    <dt>Your pledge, if missed</dt>
                    <dd>{draft.pledge}</dd>
                  </div>
                  <div>
                    <dt>Pledge check-in</dt>
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
                  Times in {draft.timezone.replaceAll('_', ' ')}. Your pledge
                  also applies if you finish late.
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
                    I agree to these terms. The confirmed version stays in my
                    record, and outcomes are self-reported.
                  </span>
                </label>
                <div className="form-actions">
                  <button
                    className="text-link"
                    onClick={() => {
                      setReview(false);
                      setAgreed(false);
                      requestAnimationFrame(() =>
                        document.getElementById('goal')?.focus(),
                      );
                    }}
                  >
                    <ArrowLeft size={15} /> Edit terms
                  </button>
                  {session ? (
                    <button
                      className="button primary"
                      disabled={!agreed || busy}
                      onClick={confirm}
                    >
                      {busy ? 'Confirming…' : 'Confirm commitment'}
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
            <p className="eyebrow">
              {review ? 'Before you confirm' : 'Your draft'}
            </p>
            <h2>{draft.goal || 'Your commitment'}</h2>
            <dl className="draft-details">
              <div>
                <dt>Done means</dt>
                <dd>{draft.doneMeans || 'Define what counts as done.'}</dd>
              </div>
              <div>
                <dt>Deadline</dt>
                <dd>{draftDate(draft.deadline)}</dd>
              </div>
              <div>
                <dt>Your pledge, if missed</dt>
                <dd>{draft.pledge || 'Choose your own pledge.'}</dd>
              </div>
              <div>
                <dt>Pledge check-in</dt>
                <dd>{draftDate(draft.pledgeCheck)}</dd>
              </div>
            </dl>
          </div>
          <div className="aside-facts">
            <p>
              The pledge is separate from the goal. Finishing late still means
              the deadline was missed.
            </p>
            <p>
              Confirming does not charge money or take action on your behalf.
            </p>
          </div>
          <p className="fine-print">
            {remindersAvailable
              ? 'Email reminders are optional. Turn them on in Account settings.'
              : 'Email reminders aren’t available yet. Keep your own reminder for now.'}
          </p>
        </aside>
      </div>
    </section>
  );
}
