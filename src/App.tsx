import { Component, Fragment, lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, Link } from 'react-router-dom';
import { Footer, Header, Loading, RouteFocus } from './components/ui';
import { useAuth } from './lib/auth';
import { Landing } from './pages/Landing';
const Auth = lazy(() =>
  import('./pages/Auth').then((m) => ({ default: m.Auth })),
);
const ResetPassword = lazy(() =>
  import('./pages/Auth').then((m) => ({ default: m.ResetPassword })),
);
const Composer = lazy(() =>
  import('./pages/Composer').then((m) => ({ default: m.Composer })),
);
const Dashboard = lazy(() =>
  import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })),
);
const Detail = lazy(() =>
  import('./pages/Detail').then((m) => ({ default: m.Detail })),
);
const Settings = lazy(() =>
  import('./pages/Settings').then((m) => ({ default: m.Settings })),
);
const Privacy = lazy(() =>
  import('./pages/Privacy').then((m) => ({ default: m.Privacy })),
);
function Private({ children }: { children: ReactNode }) {
  const { session, loading, recovery } = useAuth();
  if (loading) return <Loading />;
  if (recovery) return <Navigate to="/reset-password" replace />;
  return session ? (
    <Fragment key={session.user.id}>{children}</Fragment>
  ) : (
    <Navigate to="/auth" replace />
  );
}
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="wrap narrow">
          <h1>Something tripped up.</h1>
          <p>
            Your saved records are still on the server. Reload to try again.
          </p>
          <button
            className="button primary"
            onClick={() => window.location.reload()}
          >
            Reload the app
          </button>
        </main>
      );
    return this.props.children;
  }
}
export function App() {
  return (
    <ErrorBoundary>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main" tabIndex={-1}>
        <RouteFocus />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/new" element={<Composer />} />
            <Route
              path="/app"
              element={
                <Private>
                  <Dashboard />
                </Private>
              }
            />
            <Route
              path="/commitments/:id"
              element={
                <Private>
                  <Detail />
                </Private>
              }
            />
            <Route
              path="/settings"
              element={
                <Private>
                  <Settings />
                </Private>
              }
            />
            <Route path="/privacy" element={<Privacy />} />
            <Route
              path="*"
              element={
                <section className="wrap narrow">
                  <h1>This page got away.</h1>
                  <Link className="text-link" to="/">
                    Back to Terms Apply
                  </Link>
                </section>
              }
            />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </ErrorBoundary>
  );
}
