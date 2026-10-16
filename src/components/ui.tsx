import { ArrowRight, Asterisk, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export function Mark({ size = 25 }: { size?: number }) {
  return <Asterisk size={size} strokeWidth={3} aria-hidden="true" />;
}
export function Header() {
  const { session } = useAuth();
  const { pathname } = useLocation();
  return (
    <header className="header wrap">
      <Link
        className="brand"
        to={session ? '/app' : '/'}
        aria-label="Terms Apply home"
      >
        terms apply
        <Mark />
      </Link>
      <nav aria-label="Main navigation">
        {session ? (
          <>
            <Link
              className={pathname === '/app' ? 'nav-link current' : 'nav-link'}
              to="/app"
            >
              <span className="nav-long">My commitments</span>
              <span className="nav-short">My terms</span>
            </Link>
            <Link className="nav-link" to="/settings">
              Account
            </Link>
          </>
        ) : (
          <>
            <a className="nav-link hide-small" href="/#the-idea">
              The idea
            </a>
            <Link className="nav-link" to="/auth">
              Sign in <ArrowRight size={15} />
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
export function Footer() {
  return (
    <footer className="footer wrap">
      <Link className="brand small-brand" to="/">
        terms apply
        <Mark size={18} />
      </Link>
      <span>A little intention. In writing.</span>
      <Link to="/privacy">Privacy & the fine print</Link>
    </footer>
  );
}
export function Alert({
  children,
  success = false,
}: {
  children: ReactNode;
  success?: boolean;
}) {
  return (
    <div
      className={`alert ${success ? 'success' : ''}`}
      role={success ? 'status' : 'alert'}
    >
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={22} />
      <span>One moment…</span>
    </div>
  );
}
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-intro">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children && <div className="intro-copy">{children}</div>}
    </div>
  );
}
export function RouteFocus() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    const main = document.querySelector('main');
    main?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="dialog"
    >
      <div className="dialog-heading">
        <h2 id={titleId}>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
