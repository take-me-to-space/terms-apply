import { ArrowRight, LoaderCircle } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';

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
        <span className="brand-period" aria-hidden="true">
          .
        </span>
      </Link>
      <nav aria-label="Main navigation">
        {session ? (
          <>
            <Link
              className={pathname === '/app' ? 'nav-link current' : 'nav-link'}
              to="/app"
              aria-current={pathname === '/app' ? 'page' : undefined}
            >
              <span className="nav-long">My commitments</span>
              <span className="nav-short">Commitments</span>
            </Link>
            <Link
              className={
                pathname === '/settings' ? 'nav-link current' : 'nav-link'
              }
              to="/settings"
              aria-current={pathname === '/settings' ? 'page' : undefined}
            >
              Account
            </Link>
          </>
        ) : (
          <>
            <a className="nav-link hide-small" href="/#the-idea">
              How it works
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
        <span className="brand-period" aria-hidden="true">
          .
        </span>
      </Link>
      <span>Private records. Self-reported outcomes.</span>
      <Link to="/privacy">Privacy & terms</Link>
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
      <span>Loading…</span>
    </div>
  );
}
export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-intro">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 tabIndex={-1}>{title}</h1>
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
