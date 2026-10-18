import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Check, Clock3, Flag, LockKeyhole } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Alert, Dialog, Loading } from '../components/ui';
import { client, friendlyError } from '../lib/supabase';
import { normalizeCommitment } from '../lib/records';
import {
  formatDate,
  deviceTimezone,
  localInput,
  localToISO,
  localTimeChoices,
  outcomeLabel,
  status,
  type Commitment,
} from '../lib/model';

export function Detail() {
  const { id } = useParams();
  const [c, setC] = useState<Commitment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState<'goal' | 'pledge' | 'withdraw' | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const [answer, setAnswer] = useState('completed');
  const [completedAt, setCompletedAt] = useState(
    localInput(new Date(), 'millisecond'),
  );
  const [note, setNote] = useState('');
  const [occurrence, setOccurrence] = useState<'first' | 'second' | ''>('');
  const [, setTick] = useState(0);
  const load = useCallback(async () => {
    try {
      const { data, error } = await client()
        .from('commitments')
        .select('*, goal_reports(*), pledge_reports(*), withdrawals(*)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      setC(data ? normalizeCommitment(data) : null);
      setError('');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => setTick((n) => n + 1), 30_000);
    const focus = () => void load();
    window.addEventListener('focus', focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', focus);
    };
  }, [load]);
  function open(type: typeof modal) {
    setModal(type);
    setNote('');
    setFormError('');
    setAnswer(type === 'pledge' ? 'not_yet' : 'completed');
    const now = new Date();
    const value = localInput(now, 'millisecond');
    setCompletedAt(value);
    setOccurrence(
      new Date(value).getTimezoneOffset() === now.getTimezoneOffset()
        ? 'first'
        : 'second',
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!c || busy) return;
    setBusy(true);
    setFormError('');
    try {
      const db = client();
      let result;
      if (modal === 'withdraw')
        result = await db.rpc('withdraw_commitment', {
          p_commitment_id: c.id,
          p_reason: note || null,
        });
      else if (modal === 'pledge')
        result = await db.rpc('report_pledge', {
          p_commitment_id: c.id,
          p_outcome: answer,
          p_note: note || null,
        });
      else {
        // The database, not this selector, decides whether a completion was on time.
        result = await db.rpc('report_goal', {
          p_commitment_id: c.id,
          p_outcome: answer,
          p_completed_at:
            answer === 'completed'
              ? localToISO(completedAt, occurrence || undefined)
              : null,
          p_note: note || null,
        });
      }
      if (result.error) throw result.error;
      setModal(null);
      await load();
    } catch (e) {
      setFormError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error)
    return (
      <section className="wrap narrow">
        <Alert>{error}</Alert>
        <button className="button secondary" onClick={() => void load()}>
          Try again
        </button>
      </section>
    );
  if (!c)
    return (
      <section className="wrap narrow">
        <h1>Commitment not found</h1>
        <p>This agreement doesn’t exist, or it belongs to another account.</p>
        <Link to="/app">Back to your commitments</Link>
      </section>
    );
  const s = status(c);
  const goal = c.goal_reports[0];
  const withdrawn = c.withdrawals[0];
  const needsPledge =
    goal &&
    goal.outcome !== 'on_time' &&
    !c.pledge_reports.some((p) => p.outcome !== 'not_yet');
  const pastDeadline = Date.now() > new Date(c.deadline_at).getTime();
  const pledgeDue = Date.now() >= new Date(c.pledge_check_at).getTime();
  const choices = localTimeChoices(completedAt);
  const claimedTime =
    choices.length && (choices.length === 1 || occurrence)
      ? choices[occurrence === 'second' ? choices.length - 1 : 0]
      : null;
  const events = [
    {
      id: 'created',
      at: c.created_at,
      title: 'Agreement confirmed',
      detail: 'Original terms preserved.',
      note: null,
    },
    ...c.goal_reports.map((g) => ({
      id: g.id,
      at: g.reported_at,
      title: outcomeLabel[g.outcome],
      detail: g.completed_at
        ? `You said you finished ${formatDate(g.completed_at, undefined, true)}.`
        : 'The goal was reported missed.',
      note: g.note,
    })),
    ...c.pledge_reports.map((p) => ({
      id: p.id,
      at: p.reported_at,
      title: outcomeLabel[p.outcome],
      detail:
        p.outcome === 'not_yet'
          ? 'Still unresolved. You can answer again later.'
          : 'Pledge check-in recorded separately from the goal.',
      note: p.note,
    })),
    ...c.withdrawals.map((w) => ({
      id: w.id,
      at: w.withdrawn_at,
      title: 'Withdrawn',
      detail: 'Original agreement retained. No outcome recorded.',
      note: w.reason,
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return (
    <section className="wrap detail-page">
      <Link className="back-link" to="/app">
        <ArrowLeft size={15} /> My commitments
      </Link>
      <div className="detail-title">
        <p className="eyebrow">Your commitment</p>
        <div className={`badge ${s.tone}`}>
          <span className="tiny-dot" />
          {s.label}
        </div>
        <h1>{c.goal}</h1>
        <p>
          Confirmed {formatDate(c.confirmed_at, undefined, true)}{' '}
          <span>· Self-reported outcomes</span>
        </p>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <div className="agreement-sheet">
            <div className="paper-top">
              <span>Original terms</span>
              <LockKeyhole size={16} aria-hidden="true" />
            </div>
            <dl className="terms-list">
              <div>
                <dt>Done means</dt>
                <dd>{c.done_means}</dd>
              </div>
              <div>
                <dt>Deadline</dt>
                <dd>{formatDate(c.deadline_at, c.timezone, true)}</dd>
              </div>
              <div className="pledge-term">
                <dt>Your pledge, if missed</dt>
                <dd>{c.pledge}</dd>
              </div>
              <div>
                <dt>Pledge check-in</dt>
                <dd>{formatDate(c.pledge_check_at, c.timezone, true)}</dd>
              </div>
            </dl>
            <p className="fine-print">
              Times in {c.timezone.replaceAll('_', ' ')}. Your pledge also
              applies if you finish late.
            </p>
          </div>
          <section className="history">
            <h2>History</h2>
            <ol>
              {events.map((e) => (
                <li key={e.id}>
                  <span className="timeline-dot" />
                  <div>
                    <h3>{e.title}</h3>
                    <time dateTime={e.at}>
                      {formatDate(e.at, undefined, true)}
                    </time>
                    <p>{e.detail}</p>
                    {e.note && <blockquote>{e.note}</blockquote>}
                  </div>
                </li>
              ))}
            </ol>
            <p className="fine-print">
              Report timestamps use your current timezone. Original terms use
              the timezone of the agreement. Answers aren’t independently
              verified.
            </p>
          </section>
        </div>
        <aside className="next-action">
          <p className="eyebrow">Next action</p>
          {withdrawn ? (
            <>
              <Flag size={28} />
              <h2>Commitment withdrawn</h2>
              <p>
                You withdrew this agreement. The terms remain part of your
                record.
              </p>
              <Link className="button secondary full" to="/new">
                New commitment
              </Link>
            </>
          ) : !goal ? (
            <>
              <Clock3 size={28} />
              <h2>{pastDeadline ? 'What happened?' : 'Ready to report?'}</h2>
              <p>
                {pastDeadline
                  ? 'The deadline has passed. Tell us whether you finished, and when.'
                  : 'If you’ve finished, you can record your completion now.'}
              </p>
              <div className="action-deadline">
                <span>Deadline</span>
                <strong>{formatDate(c.deadline_at)}</strong>
              </div>
              <button
                className="button primary full"
                onClick={() => open('goal')}
              >
                {pastDeadline ? 'Report the outcome' : 'I’ve completed it'}
                <ArrowLeft className="point-right" size={17} />
              </button>
              <p className="fine-print">
                Reporting after the deadline can still count as on time. We’ll
                ask when you finished.
              </p>
              <button
                className="text-link withdraw-link"
                onClick={() => open('withdraw')}
              >
                Withdraw this commitment
              </button>
            </>
          ) : needsPledge ? (
            <>
              <Flag size={28} />
              <h2>{pledgeDue ? 'Pledge check-in' : 'Your pledge is next'}</h2>
              <p>
                {goal.outcome === 'late'
                  ? 'You finished the goal after the deadline, so your pledge still applies.'
                  : 'The goal was missed. The pledge is a separate commitment.'}
              </p>
              <p className="pledge-quote">“{c.pledge}”</p>
              <p>Check in {formatDate(c.pledge_check_at)}.</p>
              <button
                className="button primary full"
                onClick={() => open('pledge')}
              >
                {pledgeDue ? 'Report on my pledge' : 'Record “not yet”'}
              </button>
              <p className="fine-print">
                {pledgeDue
                  ? 'Without an answer, your pledge stays unresolved.'
                  : 'You can record a final answer once the pledge check-in time arrives.'}
              </p>
            </>
          ) : (
            <>
              <Check size={30} />
              <h2>
                {goal.outcome === 'on_time'
                  ? 'Completed on time'
                  : 'Reports saved'}
              </h2>
              <p>
                {goal.outcome === 'on_time'
                  ? 'You reported finishing before the deadline. No pledge is due.'
                  : 'The goal and the pledge each have their own answer. Both are saved in your history.'}
              </p>
              <Link className="button secondary full" to="/new">
                New commitment
              </Link>
            </>
          )}
        </aside>
      </div>
      {modal && (
        <Dialog
          title={
            modal === 'goal'
              ? 'What happened?'
              : modal === 'pledge'
                ? 'Did you honour your pledge?'
                : 'Withdraw this commitment?'
          }
          onClose={() => {
            if (!busy) setModal(null);
          }}
        >
          <form className="stack" onSubmit={submit}>
            {formError && <Alert>{formError}</Alert>}
            {modal === 'goal' && (
              <>
                <p className="dialog-copy">
                  Tell us what happened. Once saved, this answer stays in the
                  record.
                </p>
                <fieldset className="radio-group">
                  <legend>Goal outcome</legend>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="outcome"
                      value="completed"
                      checked={answer === 'completed'}
                      onChange={() => setAnswer('completed')}
                    />{' '}
                    I completed it
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="outcome"
                      value="missed"
                      checked={answer === 'missed'}
                      disabled={!pastDeadline}
                      onChange={() => setAnswer('missed')}
                    />{' '}
                    I missed it{' '}
                    {!pastDeadline && (
                      <span className="field-hint">
                        Available after the deadline
                      </span>
                    )}
                  </label>
                </fieldset>
                {answer === 'completed' && (
                  <>
                    <label>
                      When did you actually finish?
                      <input
                        type="datetime-local"
                        step="0.001"
                        required
                        value={completedAt}
                        onChange={(e) => {
                          setCompletedAt(e.target.value);
                          setOccurrence('');
                        }}
                        max={localInput(new Date(), 'millisecond')}
                      />
                    </label>
                    {choices.length > 1 && (
                      <label>
                        Which occurrence of that time?
                        <select
                          required
                          value={occurrence}
                          onChange={(e) =>
                            setOccurrence(
                              e.target.value as 'first' | 'second' | '',
                            )
                          }
                        >
                          <option value="">Choose the actual UTC offset</option>
                          <option value="first">
                            {formatDate(choices[0].toISOString())} — first
                            occurrence
                          </option>
                          <option value="second">
                            {formatDate(
                              choices[choices.length - 1].toISOString(),
                            )}{' '}
                            — second occurrence
                          </option>
                        </select>
                        <span className="field-hint">
                          The clocks repeat this hour. Choose when you actually
                          finished.
                        </span>
                      </label>
                    )}
                    <p className="field-hint">
                      Times in {deviceTimezone().replaceAll('_', ' ')}. Your
                      completion time determines whether the deadline was met.{' '}
                      {claimedTime && (
                        <strong>
                          {claimedTime <= new Date(c.deadline_at)
                            ? 'This will be recorded as completed on time.'
                            : 'This will be recorded as completed late. Your pledge will apply.'}
                        </strong>
                      )}
                    </p>
                  </>
                )}
              </>
            )}
            {modal === 'pledge' && (
              <>
                <p className="pledge-quote">“{c.pledge}”</p>
                <fieldset className="radio-group">
                  <legend>Your pledge outcome</legend>
                  {(
                    [
                      ['honoured', 'Honoured'],
                      ['not_honoured', 'Not honoured'],
                      ['not_yet', 'Not yet'],
                    ] as const
                  ).map(([value, title]) => (
                    <label className="radio-label" key={value}>
                      <input
                        type="radio"
                        name="pledge"
                        value={value}
                        checked={answer === value}
                        disabled={value !== 'not_yet' && !pledgeDue}
                        onChange={() => setAnswer(value)}
                      />
                      {title}
                    </label>
                  ))}
                </fieldset>
                <p className="field-hint">
                  {!pledgeDue
                    ? `Final answers open at ${formatDate(c.pledge_check_at)}. `
                    : ''}
                  “Not yet” keeps this unresolved. You can answer again later. A
                  final answer stays in the record.
                </p>
              </>
            )}
            {modal === 'withdraw' && (
              <p>
                Your original terms will stay in history, marked Withdrawn. This
                does not count as completing the goal. No reminders will be sent
                for this agreement.
              </p>
            )}
            <label>
              {modal === 'withdraw' ? 'Reason (optional)' : 'Note (optional)'}
              <textarea
                rows={3}
                maxLength={1200}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <button
              className={`button ${modal === 'withdraw' ? 'danger' : 'primary'} full`}
              disabled={busy}
            >
              {busy
                ? 'Saving…'
                : modal === 'withdraw'
                  ? 'Withdraw commitment'
                  : 'Save report'}
            </button>
          </form>
        </Dialog>
      )}
    </section>
  );
}
