import {
  accountEmailSchema,
  EMAIL_VERIFICATION_EXPIRES_IN_SECONDS,
  EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  PENDING_REGISTRATION_EXPIRES_IN_SECONDS,
  verificationCodeSchema,
} from "@amazon-2/contracts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
} from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { AccountField } from "../account/AccountField";
import { PublicAccountShell } from "../account/PublicAccountShell";
import { resendVerificationCode, verifyEmail } from "../account/api";
import {
  clearPendingRegistrationHint,
  isFreshPendingRegistrationHint,
  maskEmail,
  readPendingRegistrationHint,
  type PendingRegistrationHint,
} from "../account/pendingVerification";
import { ApiResponseError } from "../api";
import { useAuth } from "../auth/AuthProvider";

const DISPATCH_STATUS = "If a code can be delivered for this address, use the newest one. It expires in 10 minutes.";
const RECOVERY_BODY = "This browser no longer has a recent sign-up to continue. Enter your details again to request a new code.";
const VERIFIED_NOTICE = "Email verified. Welcome to the catalogue.";

interface VerificationLocationState {
  dispatchedAt?: unknown;
  dispatchStatus?: unknown;
  email?: unknown;
  introduction?: unknown;
  startedAt?: unknown;
}

interface InitialVerificationState {
  dispatchedAt: number | null;
  hint: PendingRegistrationHint | null;
  knownEmail: string | null;
  status: string;
}

function stateCandidate(state: unknown): VerificationLocationState | null {
  return typeof state === "object" && state !== null
    ? state as VerificationLocationState
    : null;
}

function normalizedStateEmail(state: unknown) {
  const candidate = stateCandidate(state);
  if (!candidate || !("email" in candidate)) return { present: false, value: null };
  const email = accountEmailSchema.safeParse(candidate.email);
  return { present: true, value: email.success ? email.data : null };
}

function initialVerificationState(state: unknown): InitialVerificationState {
  const now = Date.now();
  const candidate = stateCandidate(state);
  const routeEmail = normalizedStateEmail(state);
  const storedHint = readPendingRegistrationHint();
  const knownEmail = routeEmail.value ?? storedHint?.email ?? null;
  const routeStartedAt = candidate?.startedAt;
  const hasRouteStartedAt = routeStartedAt !== undefined;
  const validRouteStartedAt = typeof routeStartedAt === "number" &&
    Number.isFinite(routeStartedAt);
  const matchesRoute = !routeEmail.present || routeEmail.value === storedHint?.email;
  const matchesStart = !hasRouteStartedAt ||
    validRouteStartedAt && routeStartedAt === storedHint?.startedAt;

  if (
    storedHint === null ||
    !isFreshPendingRegistrationHint(storedHint, now) ||
    !matchesRoute ||
    !matchesStart
  ) {
    clearPendingRegistrationHint();
    return { dispatchedAt: null, hint: null, knownEmail, status: "" };
  }

  const routeDispatch = candidate?.dispatchedAt;
  const dispatchedAt = typeof routeDispatch === "number" &&
      Number.isFinite(routeDispatch) &&
      routeDispatch <= now
    ? routeDispatch
    : null;
  const status = candidate?.dispatchStatus === true && dispatchedAt !== null
    ? DISPATCH_STATUS
    : typeof candidate?.introduction === "string"
      ? candidate.introduction
      : "";

  return { dispatchedAt, hint: storedHint, knownEmail, status };
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function VerifyEmailPage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [initial] = useState(() => initialVerificationState(location.state));
  const [hint, setHint] = useState(initial.hint);
  const hintRef = useRef(initial.hint);
  const [dispatchedAt, setDispatchedAt] = useState<number | null>(initial.dispatchedAt);
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState(initial.status);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const codeRef = useRef<HTMLInputElement>(null);
  const resendRef = useRef<HTMLButtonElement>(null);
  const resendInFlightRef = useRef(false);
  const verificationCompletedRef = useRef(false);
  const minuteAnnouncedRef = useRef(false);
  const expiryAnnouncedRef = useRef(false);
  const cooldownAvailableAnnouncedRef = useRef(false);

  const invalidateRecovery = useCallback(() => {
    clearPendingRegistrationHint();
    hintRef.current = null;
    setHint(null);
    setDispatchedAt(null);
    setCode("");
    setCodeError(null);
    setActionError(null);
    setStatus("");
    setIsVerifying(false);
    setIsResending(false);
    resendInFlightRef.current = false;
  }, []);

  const ensureFreshRecovery = useCallback(() => {
    const current = hintRef.current;
    const stored = readPendingRegistrationHint();
    if (
      current !== null &&
      stored !== null &&
      stored.email === current.email &&
      stored.startedAt === current.startedAt &&
      isFreshPendingRegistrationHint(stored)
    ) {
      return true;
    }
    invalidateRecovery();
    return false;
  }, [invalidateRecovery]);

  const elapsedSeconds = dispatchedAt === null
    ? 0
    : Math.max(0, Math.floor((now - dispatchedAt) / 1000));
  const expiryRemaining = dispatchedAt === null
    ? null
    : Math.max(0, EMAIL_VERIFICATION_EXPIRES_IN_SECONDS - elapsedSeconds);
  const cooldownRemaining = dispatchedAt === null
    ? 0
    : Math.max(0, EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS - elapsedSeconds);
  const localExpired = dispatchedAt !== null && expiryRemaining === 0;
  const resendUnavailable = cooldownRemaining > 0 || isResending;

  useEffect(() => {
    if (!hint) return;
    const remaining = hint.startedAt + PENDING_REGISTRATION_EXPIRES_IN_SECONDS * 1000 -
      Date.now();
    if (remaining <= 0) {
      invalidateRecovery();
      return;
    }
    const timeout = window.setTimeout(invalidateRecovery, remaining);
    return () => window.clearTimeout(timeout);
  }, [hint, invalidateRecovery]);

  useEffect(() => {
    if (!hint) return;
    function handleVisibilityChange() {
      if (document.visibilityState === "visible") ensureFreshRecovery();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [ensureFreshRecovery, hint]);

  useEffect(() => {
    if (!hint || dispatchedAt === null || localExpired) return;
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (
        currentTime - dispatchedAt >=
          EMAIL_VERIFICATION_EXPIRES_IN_SECONDS * 1000
      ) {
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [dispatchedAt, hint, localExpired]);

  useEffect(() => {
    if (
      !hint ||
      expiryRemaining === null ||
      expiryRemaining > 60 ||
      expiryRemaining === 0 ||
      minuteAnnouncedRef.current
    ) {
      return;
    }
    minuteAnnouncedRef.current = true;
    setStatus("One minute remains before this code expires.");
  }, [expiryRemaining, hint]);

  useEffect(() => {
    if (!hint || !localExpired || expiryAnnouncedRef.current) return;
    expiryAnnouncedRef.current = true;
    setCodeError("That code has expired. Request a new code.");
    window.requestAnimationFrame(() => resendRef.current?.focus());
  }, [hint, localExpired]);

  useEffect(() => {
    if (
      !hint ||
      dispatchedAt === null ||
      elapsedSeconds === 0 ||
      cooldownRemaining > 0 ||
      expiryRemaining === null ||
      expiryRemaining <= 60 ||
      cooldownAvailableAnnouncedRef.current
    ) {
      return;
    }
    cooldownAvailableAnnouncedRef.current = true;
    setStatus("You can request a new code.");
  }, [cooldownRemaining, dispatchedAt, elapsedSeconds, expiryRemaining, hint]);

  if (auth.state.status === "authenticated" && !verificationCompletedRef.current) {
    return <Navigate replace to="/catalogue" />;
  }

  if (!hint) {
    const signUpState = {
      prefillEmail: initial.knownEmail ?? undefined,
      restartVerification: true,
    };
    return (
      <PublicAccountShell
        eyebrow="ACCOUNT SETUP"
        focusHeading
        footer={null}
        heading="Start sign-up again"
        support={RECOVERY_BODY}
        supportIsStatus
      >
        <div className="public-account-actions verification-recovery-actions">
          <Link
            className="button button--primary"
            onClick={clearPendingRegistrationHint}
            state={signUpState}
            to="/sign-up"
          >
            Start sign-up again
          </Link>
          <Link
            className="button button--secondary"
            onClick={clearPendingRegistrationHint}
            to="/sign-in"
          >
            Back to sign in
          </Link>
        </div>
      </PublicAccountShell>
    );
  }

  const pendingEmail = hint.email;

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    const normalized = pasted.replace(/[\s-]/g, "");
    if (/^\d{6}$/.test(normalized)) {
      event.preventDefault();
      setCode(normalized);
      setCodeError(null);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ensureFreshRecovery()) return;
    setActionError(null);

    if (localExpired) {
      setCodeError("That code has expired. Request a new code.");
      resendRef.current?.focus();
      return;
    }

    const parsedCode = verificationCodeSchema.safeParse(code);
    if (!parsedCode.success) {
      setCodeError("Enter all 6 numbers.");
      codeRef.current?.focus();
      return;
    }

    setCodeError(null);
    setStatus("Verifying email…");
    setIsVerifying(true);

    try {
      const session = await verifyEmail({ email: pendingEmail, code: parsedCode.data });
      verificationCompletedRef.current = true;
      clearPendingRegistrationHint();
      setCode("");
      setDispatchedAt(null);
      navigate("/catalogue", {
        replace: true,
        state: { accountNotice: VERIFIED_NOTICE },
      });
      auth.authenticate(session.user);
    } catch (error: unknown) {
      const codeValue = error instanceof ApiResponseError
        ? error.apiError?.error.code
        : undefined;
      if (codeValue === "VERIFICATION_CODE_INVALID") {
        setCode("");
        setCodeError("That code is incorrect, expired, or no longer usable. Request a new code if needed.");
        window.requestAnimationFrame(() => codeRef.current?.focus());
      } else if (codeValue === "RATE_LIMITED") {
        setActionError("Too many verification requests. Wait before trying again.");
      } else {
        setActionError("We couldn’t verify your email. Check your connection and try again.");
      }
      setStatus("");
      setIsVerifying(false);
    }
  }

  async function handleResend() {
    if (!ensureFreshRecovery()) return;
    if (resendUnavailable || resendInFlightRef.current) return;
    resendInFlightRef.current = true;
    setActionError(null);
    setCodeError(null);
    setStatus("Requesting a new code…");
    setIsResending(true);

    try {
      await resendVerificationCode(pendingEmail);
      const nextDispatchedAt = Date.now();
      setDispatchedAt(nextDispatchedAt);
      setNow(nextDispatchedAt);
      setCode("");
      minuteAnnouncedRef.current = false;
      expiryAnnouncedRef.current = false;
      cooldownAvailableAnnouncedRef.current = false;
      setStatus(DISPATCH_STATUS);
      setIsResending(false);
      resendInFlightRef.current = false;
    } catch (error: unknown) {
      const rateLimited = error instanceof ApiResponseError &&
        error.apiError?.error.code === "RATE_LIMITED";
      setActionError(rateLimited
        ? "Resend is temporarily unavailable. Wait before trying again."
        : "Email delivery is unavailable right now. Try again later.");
      setStatus("");
      setIsResending(false);
      resendInFlightRef.current = false;
      window.requestAnimationFrame(() => resendRef.current?.focus());
    }
  }

  return (
    <PublicAccountShell
      eyebrow="EMAIL VERIFICATION"
      footer={<>Already verified? <Link to="/sign-in">Sign in.</Link></>}
      heading="Verify your email"
      support={`Enter the 6-digit code for ${maskEmail(pendingEmail)}. If a code is available for this address, use the newest one.`}
    >
      <div
        aria-busy={isVerifying || isResending ? "true" : undefined}
        className="verification-workflow"
      >
        {actionError ? <p className="notice account-request-error" role="alert">{actionError}</p> : null}
        <form className="account-form verification-form" noValidate onSubmit={(event) => void handleVerify(event)}>
          <AccountField
            controlId="verification-code"
            error={codeError ?? undefined}
            errorIsAlert
            help="Enter all 6 numbers. Codes expire after 10 minutes."
            label="6-digit verification code"
          >
            {(accessibility) => (
              <input
                {...accessibility}
                autoComplete="one-time-code"
                id="verification-code"
                inputMode="numeric"
                maxLength={6}
                minLength={6}
                name="code"
                onChange={(event) => {
                  setCode(event.target.value);
                  if (codeError) setCodeError(null);
                }}
                onPaste={handlePaste}
                pattern="[0-9]*"
                ref={codeRef}
                spellCheck={false}
                type="text"
                value={code}
              />
            )}
          </AccountField>

          {expiryRemaining !== null ? (
            <p aria-live="off" className="verification-timer" role="timer">
              {localExpired ? "Code expired locally." : `Code expires in ${formatDuration(expiryRemaining)}`}
            </p>
          ) : null}

          <div className="verification-actions">
            <button
              className="button button--primary"
              disabled={isVerifying || isResending}
              type="submit"
            >
              {isVerifying ? "Verifying…" : "Verify email"}
            </button>
            <button
              aria-disabled={resendUnavailable ? "true" : undefined}
              className="button button--secondary"
              onClick={() => void handleResend()}
              ref={resendRef}
              type="button"
            >
              {isResending ? "Requesting code…" : "Resend code"}
            </button>
          </div>
          {cooldownRemaining > 0 ? (
            <p className="verification-cooldown">
              Resend available in {cooldownRemaining} {cooldownRemaining === 1 ? "second" : "seconds"}
            </p>
          ) : null}
          <Link
            className="button button--quiet verification-restart-action"
            onClick={clearPendingRegistrationHint}
            state={{ prefillEmail: pendingEmail, restartVerification: true }}
            to="/sign-up"
          >
            Start sign-up again
          </Link>
        </form>
        <p aria-atomic="true" aria-live="polite" className="verification-status" role="status">
          {status}
        </p>
      </div>
    </PublicAccountShell>
  );
}
