import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, Loading, Mark, PageIntro } from '../components/ui';
import {
  friendlyError,
  getCommitments,
  remindersAvailable,
} from '../lib/supabase';
import {
  dateOnly,
  formatDate,
  isResolved,
  status,
  type Commitment,
} from '../lib/model';
export function Dashboard() {
  const [records, setRecords] = useState<Commitment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'open' | 'history' | 'all'>('open');
  const [, setTick] = useState(0);
  const load = useCallback(async () => {
    setError('');
    try {
      setRecords(await getCommitments());
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const interval = setInterval(() => setTick((n) => n + 1), 30_000);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);
  const open = records.filter((c) => !isResolved(c));
  const filtered =
    filter === 'open'
      ? open
      : filter === 'history'
        ? records.filter(isResolved)
        : records;
  return (
    <section className="wrap dashboard">
      <div className="dashboard-top">
        <PageIntro eyebrow="YOUR WORD, IN WRITING" title="A deal’s a deal.">
          <p>
            A place for the things you said you’d do. And an honest record of
            what happened.
          </p>
        </PageIntro>
        <Link className="button primary" to="/new">
          <Plus size={18} /> New commitment
        </Link>
      </div>
      {!remindersAvailable && (
        <div className="quiet-banner">
          Email reminders aren’t available yet. Keep your own reminder for now.{' '}
          <Link to="/settings">
            Account settings <ArrowRight size={14} />
          </Link>
        </div>
      )}
      {loading ? (
        <Loading />
      ) : error ? (
        <>
          <Alert>{error}</Alert>
          <button className="button secondary" onClick={() => void load()}>
            <RefreshCw size={16} /> Try again
          </button>
        </>
      ) : (
        <>
          <div className="list-toolbar">
            <div className="tabs" aria-label="Commitment filters">
              {(['open', 'history', 'all'] as const).map((f) => (
                <button
                  key={f}
                  className={filter === f ? 'selected' : ''}
                  onClick={() => setFilter(f)}
                  aria-pressed={filter === f}
                >
                  {f === 'open'
                    ? 'On the table'
                    : f === 'history'
                      ? 'The record'
                      : 'Everything'}
                  <span>
                    {f === 'open'
                      ? open.length
                      : f === 'history'
                        ? records.length - open.length
                        : records.length}
                  </span>
                </button>
              ))}
            </div>
            <span className="list-caption">NO STREAKS. JUST THE RECORD.</span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <div className="empty-mark">
                <Mark size={54} />
              </div>
              <p className="eyebrow">
                {records.length ? 'NOTHING HERE FOR NOW' : 'A CLEAN SHEET'}
              </p>
              <h2>
                {records.length
                  ? filter === 'history'
                    ? 'The story is still unfolding.'
                    : 'Room for the next thing.'
                  : 'What have you been putting off?'}
              </h2>
              <p>
                {records.length
                  ? 'Your confirmed terms and reports will stay in the record.'
                  : 'Pick something small enough to finish. You can take on the rest of your life another day.'}
              </p>
              <Link className="text-link" to="/new">
                {records.length
                  ? 'Write another agreement'
                  : 'Make your first commitment'}
                <ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <div className="commitment-list">
              {filtered.map((c) => {
                const s = status(c);
                return (
                  <Link
                    className="commitment-card"
                    key={c.id}
                    to={`/commitments/${c.id}`}
                  >
                    <div className="card-date">
                      <span>BY</span>
                      <strong>{dateOnly(c.deadline_at)}</strong>
                    </div>
                    <div className="card-content">
                      <div className={`badge ${s.tone}`}>
                        <span className="tiny-dot" />
                        {s.label}
                      </div>
                      <h2>{c.goal}</h2>
                      <p>
                        {s.action}{' '}
                        <span className="card-time">
                          · {formatDate(c.deadline_at)}
                        </span>
                      </p>
                      <div className="card-pledge">
                        <span>YOUR PLEDGE</span> {c.pledge}
                      </div>
                    </div>
                    <ArrowRight className="card-arrow" size={21} />
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
      <p className="record-note">
        These are your own reports, recorded as you give them. An unanswered
        check-in stays unreported. It doesn’t count as a missed goal.
      </p>
    </section>
  );
}
