import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "./AuthProvider";

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();

  if (auth.state.status === "checking") {
    return (
      <main className="centred-state" id="main-content">
        <p className="eyebrow">Amazon 2.0</p>
        <h1>Checking your library card…</h1>
        <p aria-live="polite">Loading your session.</p>
      </main>
    );
  }

  if (auth.state.status === "error") {
    return (
      <main className="centred-state" id="main-content">
        <p className="eyebrow">CONNECTION NOTICE</p>
        <h1>Something slipped between the shelves.</h1>
        <p>We couldn’t check your session.</p>
        <button className="button button--primary" onClick={auth.retrySession} type="button">
          Try again
        </button>
      </main>
    );
  }

  if (auth.state.status === "anonymous") {
    return (
      <Navigate
        replace
        state={{ from: `${location.pathname}${location.search}` }}
        to="/sign-in"
      />
    );
  }

  return <Outlet />;
}
