import type { ReadingListEntry, ReadingListStatus } from "@amazon-2/contracts";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ApiResponseError, isUnauthenticated } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { BookCover } from "../components/BookCover";
import {
  getReadingList,
  removeReadingListEntry,
  upsertReadingListEntry,
} from "../engagement/api";
import {
  READING_LIST_STATUS_LABELS,
  READING_LIST_STATUS_ORDER,
} from "../engagement/status";

type ShelfState =
  | { kind: "loading" }
  | { kind: "ready"; entries: ReadingListEntry[] }
  | { kind: "error" };

export function MyShelfPage() {
  const auth = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ShelfState>({ kind: "loading" });
  const [mutatingBookId, setMutatingBookId] = useState<string | null>(null);
  const [mutationMessage, setMutationMessage] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });

    getReadingList(controller.signal)
      .then((response) => setState({ kind: "ready", entries: response.entries }))
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

  async function updateStatus(entry: ReadingListEntry, status: ReadingListStatus) {
    if (entry.book.availability === "UNAVAILABLE") return;
    setMutatingBookId(entry.book.id);
    setMutationMessage(null);
    setMutationError(null);

    try {
      const response = await upsertReadingListEntry(entry.book.id, { status });
      setState((current) => current.kind === "ready"
        ? {
            kind: "ready",
            entries: current.entries.map((candidate) =>
              candidate.book.id === entry.book.id ? response.entry : candidate,
            ),
          }
        : current);
      setMutationMessage(`${entry.book.title} moved to ${READING_LIST_STATUS_LABELS[response.entry.status]}.`);
    } catch (error: unknown) {
      if (isUnauthenticated(error)) {
        auth.expireSession();
        return;
      }
      if (error instanceof ApiResponseError && error.status === 404) {
        setMutationMessage("The shelf changed while you were viewing it. Your shelf was refreshed.");
        setAttempt((value) => value + 1);
      } else {
        setMutationError(`We couldn’t update ${entry.book.title}. Try again.`);
      }
    } finally {
      setMutatingBookId(null);
    }
  }

  async function removeEntry(entry: ReadingListEntry) {
    setMutatingBookId(entry.book.id);
    setMutationMessage(null);
    setMutationError(null);

    try {
      await removeReadingListEntry(entry.book.id);
      setState((current) => current.kind === "ready"
        ? {
            kind: "ready",
            entries: current.entries.filter((candidate) => candidate.book.id !== entry.book.id),
          }
        : current);
      setMutationMessage(`${entry.book.title} removed from My Shelf.`);
    } catch (error: unknown) {
      if (isUnauthenticated(error)) {
        auth.expireSession();
        return;
      }
      setMutationError(`We couldn’t remove ${entry.book.title}. Try again.`);
    } finally {
      setMutatingBookId(null);
    }
  }

  if (state.kind === "loading") {
    return (
      <main className="page-shell" id="main-content">
        <header className="page-heading">
          <p className="eyebrow">YOUR READING LIST</p>
          <h1>My Shelf</h1>
          <p aria-live="polite">Loading your shelf…</p>
        </header>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="page-shell" id="main-content">
        <div className="centred-state centred-state--within-page">
          <p className="eyebrow">CONNECTION NOTICE</p>
          <h1>We couldn’t load My Shelf.</h1>
          <p>Check your connection and try again.</p>
          <button className="button button--primary" onClick={() => setAttempt((value) => value + 1)} type="button">
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell shelf-page" id="main-content">
      <header className="page-heading catalogue-heading">
        <div>
          <p className="eyebrow">YOUR READING LIST</p>
          <h1>My Shelf</h1>
          <p>Keep each visible book in the reading state that fits.</p>
        </div>
        <p className="page-heading__count">{state.entries.length} books</p>
      </header>

      <div aria-live="polite" className="shelf-feedback">
        {mutationMessage ? <p className="notice notice--success">{mutationMessage}</p> : null}
      </div>
      {mutationError ? <p className="form-error shelf-mutation-error" role="alert">Error: {mutationError}</p> : null}

      {state.entries.length === 0 ? (
        <div className="result-message shelf-empty">
          <h2>Your shelf is ready for a first book.</h2>
          <p>Browse the catalogue and add a book you want to read.</p>
          <Link className="button button--primary" to="/catalogue">Browse the catalogue</Link>
        </div>
      ) : (
        <div className="shelf-groups">
          {READING_LIST_STATUS_ORDER.map((status) => {
            const entries = state.entries.filter((entry) => entry.status === status);
            if (entries.length === 0) return null;

            return (
              <section aria-labelledby={`shelf-${status}`} className="shelf-group" key={status}>
                <div className="section-heading-row shelf-group__heading">
                  <h2 id={`shelf-${status}`}>{READING_LIST_STATUS_LABELS[status]}</h2>
                  <span>{entries.length}</span>
                </div>
                <ul className="shelf-list">
                  {entries.map((entry) => (
                    <ShelfEntry
                      entry={entry}
                      isMutating={mutatingBookId !== null}
                      key={entry.book.id}
                      onRemove={() => void removeEntry(entry)}
                      onStatus={(nextStatus) => void updateStatus(entry, nextStatus)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function ShelfEntry({
  entry,
  isMutating,
  onRemove,
  onStatus,
}: {
  entry: ReadingListEntry;
  isMutating: boolean;
  onRemove(): void;
  onStatus(status: ReadingListStatus): void;
}) {
  const available = entry.book.availability === "AVAILABLE";

  return (
    <li className={available ? "shelf-entry" : "shelf-entry shelf-entry--unavailable"}>
      <div className="shelf-entry__cover">
        <BookCover compact seed={entry.book.coverSeed} />
      </div>
      <div className="shelf-entry__content">
        <div>
          <h3>
            {available ? <Link to={`/books/${entry.book.id}`}>{entry.book.title}</Link> : entry.book.title}
          </h3>
          <p className="book-card__author">{entry.book.author}</p>
          {!available ? (
            <p className="availability-status">
              <span aria-hidden="true">×</span> Archived / unavailable
            </p>
          ) : null}
        </div>
        <div className="shelf-entry__actions">
          <div className="compact-field shelf-status-field">
            <label htmlFor={`shelf-status-${entry.book.id}`}>Reading status for {entry.book.title}</label>
            <select
              disabled={!available || isMutating}
              id={`shelf-status-${entry.book.id}`}
              onChange={(event) => onStatus(event.target.value as ReadingListStatus)}
              value={entry.status}
            >
              {READING_LIST_STATUS_ORDER.map((status) => (
                <option key={status} value={status}>{READING_LIST_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>
          <button
            className="button button--destructive"
            disabled={isMutating}
            onClick={onRemove}
            type="button"
          >
            {isMutating ? "Saving…" : "Remove"}
          </button>
        </div>
      </div>
    </li>
  );
}
