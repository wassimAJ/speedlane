import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthProvider";

interface SignInLocationState {
  from?: string;
}

function safeDestination(state: unknown): string {
  if (
    typeof state === "object" &&
    state !== null &&
    "from" in state &&
    typeof (state as SignInLocationState).from === "string" &&
    (state as SignInLocationState).from?.startsWith("/") &&
    !(state as SignInLocationState).from?.startsWith("//")
  ) {
    return (state as SignInLocationState).from ?? "/catalogue";
  }

  return "/catalogue";
}

export function SignInPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => () => auth.clearNotice(), [auth.clearNotice]);

  if (auth.state.status === "authenticated") {
    return <Navigate replace to={safeDestination(location.state)} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await auth.signIn({ email, password });

    if (!result.ok) {
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    navigate(safeDestination(location.state), { replace: true });
  }

  return (
    <main className="sign-in-page" id="main-content">
      <section aria-labelledby="sign-in-title" className="sign-in-sheet">
        <div className="sign-in-brand" aria-hidden="true">
          <span className="sign-in-brand__card">A2</span>
          <span className="sign-in-brand__rule" />
        </div>
        <p className="eyebrow">THE LIBRARY DESK</p>
        <h1 id="sign-in-title">Sign in to the open stacks</h1>
        <p className="lede">Use a seeded demo account to browse the full active collection.</p>

        {auth.notice ? (
          <p className="notice notice--info" role="status">
            {auth.notice}
          </p>
        ) : null}

        <form className="sign-in-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
          <div className="field">
            <label htmlFor="email">Email address</label>
            <input
              autoComplete="username"
              id="email"
              maxLength={320}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              autoComplete="current-password"
              id="password"
              maxLength={256}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </div>
          {error ? (
            <p className="form-error" role="alert">
              Error: {error}
            </p>
          ) : null}
          <button className="button button--primary button--wide" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <aside aria-labelledby="demo-account-title" className="demo-account">
          <h2 id="demo-account-title">Reader demo card</h2>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>reader@amazon2.local</dd>
            </div>
            <div>
              <dt>Password</dt>
              <dd>ReaderDemo123!</dd>
            </div>
          </dl>
        </aside>
        <p className="independence-note">
          Amazon 2.0 is an independent library demo and is not affiliated with Amazon.
        </p>
      </section>
    </main>
  );
}
