import type { ReadingListEntry, ReadingListStatus } from "@amazon-2/contracts";
import { useEffect, useState } from "react";

import { ApiResponseError, isUnauthenticated } from "../api";
import { useAuth } from "../auth/AuthProvider";
import {
  getReadingList,
  removeReadingListEntry,
  upsertReadingListEntry,
} from "../engagement/api";
import {
  READING_LIST_STATUS_LABELS,
  READING_LIST_STATUS_ORDER,
} from "../engagement/status";

type ControlsState =
  | { kind: "loading" }
  | { kind: "ready"; entry: ReadingListEntry | null }
  | { kind: "error" };

export function ReadingListControls({ bookId }: { bookId: string }) {
  const auth = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ControlsState>({ kind: "loading" });
  const [isMutating, setIsMutating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });

    getReadingList(controller.signal)
      .then((response) => {
        const entry = response.entries.find((candidate) => candidate.book.id === bookId) ?? null;
        setState({ kind: "ready", entry });
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
  }, [attempt, auth.expireSession, bookId]);

  async function upsert(input: { status?: ReadingListStatus }) {
    setIsMutating(true);
    setMessage(null);
    setMutationError(null);

    try {
      const response = await upsertReadingListEntry(bookId, input);
      setState({ kind: "ready", entry: response.entry });
      setMessage(input.status === undefined
        ? "Saved to My Shelf."
        : `Moved to ${READING_LIST_STATUS_LABELS[response.entry.status]}.`);
    } catch (error: unknown) {
      if (isUnauthenticated(error)) {
        auth.expireSession();
        return;
      }
      setMutationError(
        error instanceof ApiResponseError && error.status === 404
          ? "This book is not available for shelf updates."
          : "We couldn’t update My Shelf. Try again.",
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function remove() {
    setIsMutating(true);
    setMessage(null);
    setMutationError(null);

    try {
      await removeReadingListEntry(bookId);
      setState({ kind: "ready", entry: null });
      setMessage("Removed from My Shelf.");
    } catch (error: unknown) {
      if (isUnauthenticated(error)) {
        auth.expireSession();
        return;
      }
      setMutationError("We couldn’t remove this book from My Shelf. Try again.");
    } finally {
      setIsMutating(false);
    }
  }

  if (state.kind === "loading") {
    return <p aria-live="polite" className="shelf-control-status">Checking My Shelf…</p>;
  }

  if (state.kind === "error") {
    return (
      <div className="detail-shelf-controls detail-shelf-controls--error">
        <p>My Shelf controls are unavailable right now.</p>
        <button className="button button--quiet" onClick={() => setAttempt((value) => value + 1)} type="button">
          Try again
        </button>
      </div>
    );
  }

  if (state.entry?.book.availability === "UNAVAILABLE") {
    return (
      <div className="detail-shelf-controls detail-shelf-controls--error">
        <p>My Shelf controls are unavailable for this record.</p>
      </div>
    );
  }

  return (
    <section aria-labelledby="detail-shelf-heading" className="detail-shelf-controls">
      <h2 className="visually-hidden" id="detail-shelf-heading">My Shelf</h2>
      {state.entry === null ? (
        <button
          className="button button--primary"
          disabled={isMutating}
          onClick={() => void upsert({})}
          type="button"
        >
          {isMutating ? "Saving…" : "Add to My Shelf"}
        </button>
      ) : (
        <div className="detail-shelf-controls__actions">
          <div className="compact-field">
            <label htmlFor={`detail-shelf-status-${bookId}`}>Reading status</label>
            <select
              disabled={isMutating}
              id={`detail-shelf-status-${bookId}`}
              onChange={(event) => void upsert({ status: event.target.value as ReadingListStatus })}
              value={state.entry.status}
            >
              {READING_LIST_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>{READING_LIST_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>
          <button
            className="button button--destructive"
            disabled={isMutating}
            onClick={() => void remove()}
            type="button"
          >
            {isMutating ? "Saving…" : "Remove from My Shelf"}
          </button>
        </div>
      )}
      <p aria-live="polite" className="saved-feedback">{message ?? ""}</p>
      {mutationError ? <p className="form-error" role="alert">Error: {mutationError}</p> : null}
    </section>
  );
}
