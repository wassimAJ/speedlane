import { Link, Outlet } from "react-router-dom";

import { useAuth } from "./AuthProvider";

export function LibrarianRoute() {
  const auth = useAuth();

  if (auth.state.status !== "authenticated") {
    return null;
  }

  if (auth.state.user.role !== "LIBRARIAN") {
    return (
      <main className="page-shell" id="main-content">
        <section className="centred-state centred-state--within-page forbidden-state">
          <p className="eyebrow">403 · Staff only</p>
          <h1>That room is for librarians.</h1>
          <p>Your reader card still works everywhere in the public stacks.</p>
          <Link className="button button--primary" to="/catalogue">
            Return to catalogue
          </Link>
        </section>
      </main>
    );
  }

  return <Outlet />;
}
