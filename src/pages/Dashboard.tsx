import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Alert, Loading, PageIntro } from '../components/ui';
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
        <PageIntro title="Your commitments">
          <p>Open agreements and a record of what happened.</p>
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
                  {f === 'open' ? 'Open' : f === 'history' ? 'History' : 'All'}
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
            <span className="list-caption">
              {records.length}{' '}
              {records.length === 1 ? 'commitment' : 'commitments'}
            </span>
          </div>
          {filtered.length === 0 ? (
            <div className="empty-state">
              <h2>
                {records.length
                  ? filter === 'history'
                    ? 'No completed records yet'
                    : 'No open commitments'
                  : 'Start with one task.'}
              </h2>
              <p>
                {records.length
                  ? 'Your original terms and reports stay available in History.'
                  : 'Choose something you can finish in the next day or two. Set a deadline and a pledge of your own.'}
              </p>
              <Link className="text-link" to="/new">
                {records.length
                  ? 'New commitment'
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
                      <span>Deadline</span>
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
                        <span>Your pledge</span> {c.pledge}
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
        Outcomes are self-reported. An unanswered check-in stays unreported; it
        doesn’t count as a missed goal.
      </p>
    </section>
  );
}
