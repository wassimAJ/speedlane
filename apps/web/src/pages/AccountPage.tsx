import {
  updateProfileInputSchema,
  type Profile,
} from "@amazon-2/contracts";
import { useEffect, useState, type FormEvent } from "react";

import { AccountField } from "../account/AccountField";
import { getProfile, updateProfile } from "../account/api";
import { isUnauthenticated } from "../api";
import { useAuth } from "../auth/AuthProvider";

type ProfileState =
  | { kind: "loading" }
  | { kind: "ready"; profile: Profile }
  | { kind: "error" };

const LONG_DATE = new Intl.DateTimeFormat(undefined, { dateStyle: "long" });

function formattedDate(value: string) {
  return LONG_DATE.format(new Date(value));
}

export function AccountPage() {
  const auth = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ProfileState>({ kind: "loading" });
  const [displayName, setDisplayName] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    setFieldError(null);
    setRequestError(null);
    setStatus("");

    getProfile(controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setState({ kind: "ready", profile: response.profile });
        setDisplayName(response.profile.displayName);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isUnauthenticated(error)) {
          auth.expireSession();
          return;
        }
        setState({ kind: "error" });
      });

    return () => controller.abort();
  }, [attempt, auth.expireSession]);

  if (state.kind === "loading") {
    return (
      <main className="page-shell account-page" id="main-content">
        <section aria-busy="true" aria-live="polite" className="account-page-state">
          <p>Loading your account…</p>
        </section>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="page-shell account-page" id="main-content">
        <section className="account-page-state">
          <h1>We couldn’t load your account.</h1>
          <button className="button button--primary" onClick={() => setAttempt((value) => value + 1)} type="button">
            Try again
          </button>
        </section>
      </main>
    );
  }

  const parsedDraft = updateProfileInputSchema.safeParse({ displayName });
  const trimmedName = displayName.trim();
  const isUnchanged = trimmedName === state.profile.displayName;
  const saveDisabled = isSaving || !parsedDraft.success || isUnchanged;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = updateProfileInputSchema.safeParse({ displayName });
    if (!parsed.success) {
      setFieldError("Enter a display name.");
      setStatus("");
      return;
    }

    setFieldError(null);
    setRequestError(null);
    setStatus("");
    setIsSaving(true);

    try {
      const response = await updateProfile(parsed.data);
      setState({ kind: "ready", profile: response.profile });
      setDisplayName(response.profile.displayName);
      auth.updateAuthenticatedUser({
        displayName: response.profile.displayName,
        email: response.profile.email,
        id: response.profile.id,
        role: response.profile.role,
      });
      setStatus("Display name updated.");
      setIsSaving(false);
    } catch (error: unknown) {
      if (isUnauthenticated(error)) {
        auth.expireSession();
        return;
      }
      setRequestError("We couldn’t update your display name. Try again.");
      setIsSaving(false);
    }
  }

  return (
    <main className="page-shell account-page" id="main-content">
      <header className="page-heading account-page__heading">
        <p className="eyebrow">YOUR LIBRARY CARD</p>
        <h1>Account</h1>
        <p>Review your membership details and update how your name appears.</p>
      </header>

      <div className="account-record">
        <section aria-labelledby="account-name-heading" className="account-name-editor">
          <h2 id="account-name-heading">Display name</h2>
          {requestError ? <p className="notice account-request-error" role="alert">{requestError}</p> : null}
          <form
            aria-busy={isSaving ? "true" : undefined}
            className="account-form"
            noValidate
            onSubmit={(event) => void handleSave(event)}
          >
            <AccountField
              controlId="account-display-name"
              error={fieldError ?? undefined}
              label="Display name"
            >
              {(accessibility) => (
                <input
                  {...accessibility}
                  autoComplete="name"
                  id="account-display-name"
                  maxLength={120}
                  name="displayName"
                  onBlur={() => {
                    if (displayName.trim() === "") setFieldError("Enter a display name.");
                  }}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    if (fieldError && event.target.value.trim() !== "") setFieldError(null);
                    setStatus("");
                  }}
                  type="text"
                  value={displayName}
                />
              )}
            </AccountField>
            <button className="button button--primary" disabled={saveDisabled} type="submit">
              {isSaving ? "Saving…" : "Save display name"}
            </button>
          </form>
          <p aria-atomic="true" aria-live="polite" className="account-save-status" role="status">
            {status}
          </p>
        </section>

        <section aria-labelledby="membership-details-heading" className="membership-details">
          <h2 id="membership-details-heading">Membership details</h2>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{state.profile.email}</dd>
            </div>
            <div>
              <dt>Email verification</dt>
              <dd>
                Verified on {" "}
                <time dateTime={state.profile.emailVerifiedAt}>
                  {formattedDate(state.profile.emailVerifiedAt)}
                </time>
              </dd>
            </div>
            <div>
              <dt>Member since</dt>
              <dd>
                <time dateTime={state.profile.createdAt}>{formattedDate(state.profile.createdAt)}</time>
              </dd>
            </div>
            <div>
              <dt>Access role</dt>
              <dd>{state.profile.role === "LIBRARIAN" ? "Librarian" : "Reader"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
