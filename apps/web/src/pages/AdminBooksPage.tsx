import type { AdminBook, AdminBookInput, AdminGenre, AdminRecordStatus } from "@amazon-2/contracts";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminBookForm } from "../admin/AdminBookForm";
import { ArchiveConfirmation } from "../admin/ArchiveConfirmation";
import { BackRoomHeader, StatusTabs } from "../admin/BackRoomHeader";
import {
  AdminResponseError,
  archiveAdminBook,
  createAdminBook,
  getAdminBooks,
  getAdminGenres,
  restoreAdminBook,
  updateAdminBook,
} from "../admin/api";
import { useAuth } from "../auth/AuthProvider";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; books: AdminBook[]; genres: AdminGenre[] }
  | { status: "error"; message: string };

function messageFor(error: unknown, fallback: string) {
  return error instanceof AdminResponseError ? error.message : fallback;
}

export function AdminBooksPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const recordStatus: AdminRecordStatus = searchParams.get("status") === "archived" ? "archived" : "active";
  const [attempt, setAttempt] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [editing, setEditing] = useState<AdminBook | "create" | null>(null);
  const [confirming, setConfirming] = useState<AdminBook | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: "loading" });
    setMutationError(null);
    setEditing(null);

    Promise.all([getAdminBooks(recordStatus), getAdminGenres("active")])
      .then(([books, genres]) => {
        if (!controller.signal.aborted) setLoadState({ status: "ready", books, genres });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof AdminResponseError && error.status === 401) {
          auth.expireSession();
          return;
        }
        setLoadState({
          status: "error",
          message: messageFor(error, "The book ledger is unavailable. Try the request again."),
        });
      });

    return () => controller.abort();
  }, [attempt, auth, recordStatus]);

  function refresh(message: string) {
    setFeedback(message);
    setAttempt((current) => current + 1);
  }

  async function saveBook(input: AdminBookInput) {
    try {
      if (editing === "create") {
        await createAdminBook(input);
        setEditing(null);
        refresh(`Created “${input.title}”.`);
        return;
      }
      if (editing) {
        await updateAdminBook(editing.id, input);
        setEditing(null);
        refresh(`Updated “${input.title}”.`);
      }
    } catch (error: unknown) {
      if (error instanceof AdminResponseError && error.status === 401) auth.expireSession();
      throw error;
    }
  }

  async function confirmArchive() {
    if (!confirming) return;
    const book = confirming;
    setBusyId(book.id);
    setMutationError(null);
    try {
      await archiveAdminBook(book.id);
      setConfirming(null);
      setBusyId(null);
      refresh(`Archived “${book.title}”. You can restore it from Archived.`);
    } catch (error: unknown) {
      if (error instanceof AdminResponseError && error.status === 401) {
        auth.expireSession();
      } else {
        setMutationError(messageFor(error, "The book could not be archived. Try again."));
      }
      setConfirming(null);
      setBusyId(null);
    }
  }

  async function restore(book: AdminBook) {
    setBusyId(book.id);
    setMutationError(null);
    try {
      await restoreAdminBook(book.id);
      setBusyId(null);
      refresh(`Restored “${book.title}”.`);
    } catch (error: unknown) {
      if (error instanceof AdminResponseError && error.status === 401) {
        auth.expireSession();
      } else {
        setMutationError(messageFor(error, "The book could not be restored. Try again."));
      }
      setBusyId(null);
    }
  }

  const ready = loadState.status === "ready" ? loadState : null;

  return (
    <main className="page-shell back-room-page" id="main-content">
      <BackRoomHeader description="Maintain complete catalogue records while archived books remain recoverable." title="Book records" />
      <div className="admin-toolbar">
        <StatusTabs section="books" status={recordStatus} />
        {recordStatus === "active" ? (
          <button className="button button--primary" onClick={() => setEditing("create")} type="button">Add book</button>
        ) : null}
      </div>
      {feedback ? <p aria-live="polite" className="notice notice--success">{feedback}</p> : null}
      {mutationError ? <p className="notice admin-mutation-error" role="alert">{mutationError}</p> : null}

      {ready && editing !== null ? (
        <AdminBookForm
          book={editing === "create" ? null : editing}
          genres={ready.genres}
          key={editing === "create" ? "create" : editing.id}
          onCancel={() => setEditing(null)}
          onSave={saveBook}
        />
      ) : null}

      {loadState.status === "loading" ? (
        <section aria-live="polite" className="admin-state"><h2>Checking the accession ledger…</h2></section>
      ) : loadState.status === "error" ? (
        <section className="admin-state"><h2>The book ledger is unavailable.</h2><p role="alert">{loadState.message}</p><button className="button button--secondary" onClick={() => setAttempt((value) => value + 1)} type="button">Try again</button></section>
      ) : loadState.books.length === 0 ? (
        <section className="admin-state"><h2>No {recordStatus} books</h2><p>{recordStatus === "active" ? "Add the first catalogue record." : "Archived records will wait here for restoration."}</p></section>
      ) : (
        <div className="admin-table-scroll" role="region" aria-label={`${recordStatus} book records`} tabIndex={0}>
          <table className="admin-table">
            <caption className="visually-hidden">{recordStatus === "active" ? "Active" : "Archived"} book records</caption>
            <thead><tr><th scope="col">Book</th><th scope="col">ISBN</th><th scope="col">Year</th><th scope="col">Genres</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {loadState.books.map((book) => (
                <tr key={book.id}>
                  <th scope="row"><span className="admin-record-title">{book.title}</span><span className="admin-record-detail">{book.author}</span></th>
                  <td className="admin-mono">{book.isbn}</td>
                  <td>{book.publicationYear}</td>
                  <td>{book.genres.map((genre) => genre.name).join(", ")}</td>
                  <td><div className="admin-row-actions">
                    {recordStatus === "active" ? (
                      <><button className="button button--quiet" onClick={() => setEditing(book)} type="button">Edit <span className="visually-hidden">{book.title}</span></button><button className="button button--quiet admin-danger" onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setConfirming(book); }} type="button">Archive <span className="visually-hidden">{book.title}</span></button></>
                    ) : (
                      <button className="button button--secondary" disabled={busyId === book.id} onClick={() => void restore(book)} type="button">{busyId === book.id ? "Restoring…" : <>Restore <span className="visually-hidden">{book.title}</span></>}</button>
                    )}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirming ? <ArchiveConfirmation busy={busyId === confirming.id} kind="book" name={confirming.title} onCancel={() => setConfirming(null)} onConfirm={() => void confirmArchive()} returnFocus={archiveTriggerRef.current} /> : null}
    </main>
  );
}
