import {
  ArrowDown,
  ArrowRight,
  Check,
  CornerDownRight,
  MoveUpRight,
} from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { Mark } from '../components/ui';
import { useAuth } from '../lib/auth';
export function Landing() {
  const { session } = useAuth();
  if (session) return <Navigate to="/app" replace />;
  return (
    <>
      <section className="hero wrap">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-dot" /> FOR THE THING YOU KEEP PUTTING OFF
          </p>
          <h1>
            Make a deal.
            <br />
            <em>With yourself.</em>
          </h1>
          <p className="hero-description">
            You know the thing. The walk. The application.
            <br className="hide-small" /> The project with an impressive
            collection of tomorrows.
          </p>
          <p className="hero-description">
            Give it a deadline. Set your own terms.
            <br />
            Then show up for the check-in.
          </p>
          <Link className="button primary" to="/new">
            Put it in writing <ArrowRight size={19} />
          </Link>
          <p className="under-button">Your goal. Your pledge. Your word.</p>
          <a className="text-link hero-down" href="#the-idea">
            <ArrowDown size={15} /> A small agreement. Here’s the idea.
          </a>
        </div>
        <div
          className="hero-art"
          aria-label="Example agreement: walk for 30 minutes before 8 pm; give up Netflix for two evenings if missed"
        >
          <div className="art-caption">
            <span>A NOTE TO TOMORROW-YOU</span>
            <span>NO. 001 ↘</span>
          </div>
          <div className="example-paper">
            <div className="paper-top">
              <span>THE PERSONAL AGREEMENT</span>
              <Mark size={32} />
            </div>
            <p className="paper-prefix">I’m going to</p>
            <h2>
              Take the walk.
              <br />
              All 30 minutes.
            </h2>
            <div className="example-rule">
              <span>BY WHEN</span>
              <strong>Tomorrow, before 8 pm.</strong>
            </div>
            <div className="example-rule">
              <span>DONE MEANS</span>
              <p>
                30 minutes walking outside.
                <br />
                Thinking about it doesn’t count.
              </p>
            </div>
            <div className="example-pledge">
              <CornerDownRight size={19} />
              <div>
                <span>MY PLEDGE, IF MISSED</span>
                <p>
                  No Netflix for the next
                  <br />
                  two evenings.
                </p>
              </div>
            </div>
            <div className="paper-signature">
              <span>Signed, me.</span>
              <span className="hand-check">
                <Check size={32} strokeWidth={1.8} />
              </span>
            </div>
          </div>
          <div className="honesty-seal">
            <Mark size={29} />
            <span>
              GOOD ON
              <br />
              YOUR WORD
            </span>
          </div>
          <div className="art-footnote">
            <span>Not legally binding.</span>
            <span>A little personally binding.</span>
          </div>
        </div>
      </section>
      <div className="ticker" aria-hidden="true">
        <span>LESS “I SHOULD.”</span>
        <Mark size={21} />
        <span>MORE “I DID.”</span>
        <Mark size={21} />
        <span>ON YOUR OWN TERMS.</span>
        <Mark size={21} />
        <span>LESS “I SHOULD.”</span>
        <Mark size={21} />
        <span>MORE “I DID.”</span>
      </div>
      <section className="how-section wrap" id="the-idea">
        <div className="section-heading">
          <p className="eyebrow">NOT ANOTHER TO-DO LIST</p>
          <h2>
            A bit of intention.
            <br />
            <em>A little fine print.</em>
          </h2>
          <p>
            No streak to protect. No audience to impress.
            <br />
            Just one clear thing, and what you’ll do about it.
          </p>
        </div>
        <div className="steps-grid">
          {[
            [
              '01',
              'Name the thing.',
              'Make it small enough to finish and clear enough to call done. “Walk for 30 minutes” beats “be healthier.”',
            ],
            [
              '02',
              'Make your terms.',
              'Choose a deadline and a pledge if you miss it. Something meaningful and manageable. Always your choice.',
            ],
            [
              '03',
              'Tell it straight.',
              'Come back and say what happened. Finished late? That counts as late. Pledge honoured? That gets its own answer.',
            ],
          ].map(([n, title, text]) => (
            <article className="step" key={n}>
              <span className="step-number">
                {n} <MoveUpRight size={22} />
              </span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="honesty-section wrap">
        <div className="big-asterisk">
          <Mark size={120} />
        </div>
        <div>
          <p className="eyebrow">THE ACTUAL FINE PRINT</p>
          <h2>We take your word for it.</h2>
          <p>
            No proof uploads. No automatic penalties. No money taken when you
            miss a goal. We keep the agreement, bring it back for a check-in,
            and record what you tell us.
          </p>
          <p>Some days, you’ll miss. The next honest answer still matters.</p>
          <Link className="text-link" to="/new">
            Make your first agreement <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      <section className="last-word wrap">
        <p className="eyebrow">A GOOD TIME TO START</p>
        <h2>
          Before this becomes
          <br />
          <em>another open tab.</em>
        </h2>
        <Link className="button primary" to="/new">
          Put it in writing <ArrowRight size={19} />
        </Link>
        <p>Free to use. No card. No automatic consequences.</p>
      </section>
    </>
  );
}
