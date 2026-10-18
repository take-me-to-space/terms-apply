import { ArrowRight } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { remindersAvailable } from '../lib/supabase';

export function Landing() {
  const { session } = useAuth();
  if (session) return <Navigate to="/app" replace />;
  return (
    <div className="wrap landing">
      <section className="hero">
        <div className="hero-copy">
          <p className="intro-label">A private commitment, in writing.</p>
          <h1>
            Put a date
            <br />
            on it.
          </h1>
          <p className="hero-description">
            Choose what you’ll do, when you’ll do it, and your pledge if you
            miss it.
          </p>
          <Link className="button primary" to="/new">
            Make a commitment <ArrowRight size={19} aria-hidden="true" />
          </Link>
          <p className="hero-small">
            {remindersAvailable
              ? 'Free to use. Email reminders are optional.'
              : 'Free to use. Choose your own terms.'}
          </p>
        </div>
        <figure className="hero-figure">
          <img
            className="hero-image"
            src="/images/walk-1280.webp"
            srcSet="/images/walk-768.webp 768w, /images/walk-1280.webp 1280w"
            sizes="(max-width: 680px) calc(100vw - 40px), (max-width: 950px) 48vw, 560px"
            width={1280}
            height={854}
            fetchPriority="high"
            alt="A canvas walking shoe resting on a stack of calendar pages, against a red background."
          />
          <figcaption>
            <span className="mono">THE EXAMPLE / 01</span>
            <span>A 30-minute walk. Tomorrow, before 8 pm.</span>
          </figcaption>
        </figure>
      </section>
      <section className="landing-rule">
        <h2>We’ll ask how it went.</h2>
        <p>
          {remindersAvailable
            ? 'Opt in to email reminders and check-ins. You report the outcome; we keep the original terms and your answers.'
            : 'You report the outcome; we keep the original terms and your answers. Email reminders aren’t available yet.'}
        </p>
      </section>
      <section
        className="how-section"
        id="the-idea"
        aria-labelledby="how-title"
      >
        <div className="how-heading">
          <p className="eyebrow">How it works</p>
          <h2 id="how-title">The terms are yours.</h2>
          <p>
            Your pledge should be manageable and additional to your usual
            obligations.
          </p>
        </div>
        <ol className="how-steps">
          {[
            [
              '01',
              'Choose something specific.',
              'A task you can finish, a clear definition of done, and a deadline.',
            ],
            [
              '02',
              'Decide your pledge.',
              'Choose what you’ll do or give up if you miss the deadline, and when you can report on it.',
            ],
            [
              '03',
              'Record what happened.',
              'On time, late, or missed. Late and missed goals get a separate pledge check-in. An unanswered check-in stays unreported.',
            ],
          ].map(([number, title, text]) => (
            <li key={number}>
              <span className="mono" aria-hidden="true">
                {number}
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="walking-example" aria-labelledby="example-title">
        <div>
          <p className="eyebrow">An example</p>
          <h2 id="example-title">One walk. Your own terms.</h2>
        </div>
        <dl className="example-terms">
          <div>
            <dt>Goal</dt>
            <dd>Walk for 30 minutes tomorrow before 8 pm.</dd>
          </div>
          <div>
            <dt>Done means</dt>
            <dd>Spend 30 minutes walking outside.</dd>
          </div>
          <div>
            <dt>If missed</dt>
            <dd>Give up Netflix for the next two evenings.</dd>
          </div>
          <div>
            <dt>Pledge check-in</dt>
            <dd>After those two evenings have passed.</dd>
          </div>
        </dl>
        <p className="fine-print">
          You choose the pledge. The app records your answers; it doesn’t verify
          your actions or enforce consequences.
        </p>
      </section>
    </div>
  );
}
