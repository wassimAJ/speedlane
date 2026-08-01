import {
  accountEmailSchema,
  registerInputSchema,
  type RegisterInput,
} from "@amazon-2/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { AccountErrorSummary, type AccountErrorSummaryItem } from "../account/AccountErrorSummary";
import { AccountField } from "../account/AccountField";
import { PublicAccountShell } from "../account/PublicAccountShell";
import { registerReader } from "../account/api";
import {
  clearPendingRegistrationHint,
  writePendingRegistrationHint,
} from "../account/pendingVerification";
import { ApiResponseError } from "../api";
import { useAuth } from "../auth/AuthProvider";

type RegistrationField = keyof RegisterInput;
type RegistrationErrors = Partial<Record<RegistrationField, string>>;

const FIELD_LABELS: Record<RegistrationField, string> = {
  displayName: "Display name",
  email: "Email address",
  password: "Password",
};

function validationErrors(input: RegisterInput): RegistrationErrors {
  const parsed = registerInputSchema.safeParse(input);
  if (parsed.success) return {};

  const errors: RegistrationErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field !== "displayName" && field !== "email" && field !== "password") continue;
    if (errors[field]) continue;

    if (field === "displayName") {
      errors.displayName = input.displayName.trim() === ""
        ? "Enter a display name."
        : "Display name must be 120 characters or fewer.";
    } else if (field === "email") {
      errors.email = "Enter a valid email address.";
    } else if (issue.code === "too_small") {
      errors.password = "Password must be at least 12 characters.";
    } else if (issue.code === "too_big") {
      errors.password = "Password must be 128 characters or fewer.";
    } else {
      errors.password = issue.message;
    }
  }
  return errors;
}

function summaryItems(errors: RegistrationErrors): AccountErrorSummaryItem[] {
  return (Object.keys(FIELD_LABELS) as RegistrationField[])
    .filter((field) => errors[field] !== undefined)
    .map((field) => ({
      controlId: `registration-${field}`,
      label: FIELD_LABELS[field],
      message: errors[field] ?? "",
    }));
}

interface SignUpLocationState {
  prefillEmail?: unknown;
  restartVerification?: unknown;
}

function restartState(state: unknown) {
  if (typeof state !== "object" || state === null) {
    return { email: "", isRestart: false };
  }
  const candidate = state as SignUpLocationState;
  const email = accountEmailSchema.safeParse(candidate.prefillEmail);
  return {
    email: email.success ? email.data : "",
    isRestart: candidate.restartVerification === true,
  };
}

export function SignUpPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [restart] = useState(() => restartState(location.state));
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState(restart.email);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [summaryFocusTrigger, setSummaryFocusTrigger] = useState(0);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    clearPendingRegistrationHint();
  }, []);

  if (auth.state.status === "authenticated") {
    return <Navigate replace to="/catalogue" />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = { displayName, email, password };
    const parsed = registerInputSchema.safeParse(input);

    if (!parsed.success) {
      setErrors(validationErrors(input));
      setSummaryFocusTrigger((trigger) => trigger + 1);
      setRequestError(null);
      return;
    }

    setErrors({});
    setRequestError(null);
    setIsSubmitting(true);

    try {
      const response = await registerReader(parsed.data);
      const startedAt = Date.now();
      const pending = writePendingRegistrationHint(response.verification.email, startedAt);
      navigate("/verify-email", {
        state: {
          dispatchedAt: startedAt,
          dispatchStatus: true,
          email: pending.email,
          startedAt: pending.startedAt,
        },
      });
    } catch (error: unknown) {
      const rateLimited = error instanceof ApiResponseError &&
        error.apiError?.error.code === "RATE_LIMITED";
      setRequestError(rateLimited
        ? "Too many account requests. Wait before trying again."
        : "Account creation is unavailable right now. Try again later.");
      setIsSubmitting(false);
    }
  }

  const items = summaryItems(errors);

  return (
    <PublicAccountShell
      eyebrow="NEW READER ACCOUNT"
      footer={<>Already have an account? <Link to="/sign-in">Sign in.</Link></>}
      focusHeading={restart.isRestart}
      heading="Create your library account"
      support="Set up your Reader profile, then verify your email to enter the catalogue."
    >
      {restart.isRestart ? (
        <div className="account-restart-guidance">
          <p>Start sign-up again to continue email verification.</p>
          <p>Enter your display name and password again. Your email address is already filled in.</p>
        </div>
      ) : null}
      {items.length > 0 ? (
        <AccountErrorSummary focusTrigger={summaryFocusTrigger} items={items} />
      ) : null}
      <p className="account-role-note">New accounts have Reader access.</p>
      {requestError ? <p className="notice account-request-error" role="alert">{requestError}</p> : null}
      <form
        aria-busy={isSubmitting ? "true" : undefined}
        className="account-form"
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
      >
        <AccountField
          controlId="registration-displayName"
          error={errors.displayName}
          label="Display name"
        >
          {(accessibility) => (
            <input
              {...accessibility}
              autoComplete="name"
              id="registration-displayName"
              maxLength={120}
              name="displayName"
              onChange={(event) => setDisplayName(event.target.value)}
              type="text"
              value={displayName}
            />
          )}
        </AccountField>
        <AccountField
          controlId="registration-email"
          error={errors.email}
          label="Email address"
        >
          {(accessibility) => (
            <input
              {...accessibility}
              autoComplete="email"
              id="registration-email"
              maxLength={320}
              name="email"
              onChange={(event) => setEmail(event.target.value)}
              spellCheck={false}
              type="email"
              value={email}
            />
          )}
        </AccountField>
        <AccountField
          controlId="registration-password"
          error={errors.password}
          help="Use 12–128 characters with at least one uppercase letter, one lowercase letter, and one number."
          label="Password"
        >
          {(accessibility) => (
            <input
              {...accessibility}
              autoComplete="new-password"
              id="registration-password"
              maxLength={128}
              name="password"
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              value={password}
            />
          )}
        </AccountField>
        <button
          className="button button--primary button--wide"
          disabled={isSubmitting}
          type="submit"
        >
          {isSubmitting ? "Creating account…" : "Create reader account"}
        </button>
      </form>
    </PublicAccountShell>
  );
}
