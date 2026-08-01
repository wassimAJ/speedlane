import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { PublicAccountShell } from "../account/PublicAccountShell";
import {
  clearPendingRegistrationHint,
  isFreshPendingRegistrationHint,
  readPendingRegistrationHint,
} from "../account/pendingVerification";
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
      if (result.kind === "email-not-verified") {
        const hint = readPendingRegistrationHint();
        if (
          hint !== null &&
          hint.email === result.email &&
          isFreshPendingRegistrationHint(hint)
        ) {
          navigate("/verify-email", {
            state: {
              email: hint.email,
              introduction: result.message,
              startedAt: hint.startedAt,
            },
          });
        } else {
          clearPendingRegistrationHint();
          navigate("/sign-up", {
            replace: true,
            state: {
              prefillEmail: result.email,
              restartVerification: true,
            },
          });
        }
        return;
      }
      setError(result.message);
      setIsSubmitting(false);
      return;
    }

    navigate(safeDestination(location.state), { replace: true });
  }

  return (
    <PublicAccountShell
      eyebrow="THE LIBRARY DESK"
      footer={<>New to Amazon 2.0? <Link to="/sign-up">Create a reader account.</Link></>}
      heading="Sign in to the open stacks"
      support="Sign in to browse the full active collection."
    >
      {auth.notice ? (
        <p className="notice notice--info" role="status">
          {auth.notice}
        </p>
      ) : null}

      <form
        aria-busy={isSubmitting ? "true" : undefined}
        className="sign-in-form"
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input
            autoComplete="username"
            id="email"
            maxLength={320}
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            spellCheck={false}
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
            name="password"
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
    </PublicAccountShell>
  );
}
