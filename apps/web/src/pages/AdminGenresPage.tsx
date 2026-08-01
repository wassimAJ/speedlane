import type { AdminGenre, AdminGenreInput, AdminRecordStatus } from "@amazon-2/contracts";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AdminGenreForm } from "../admin/AdminGenreForm";
import { ArchiveConfirmation } from "../admin/ArchiveConfirmation";
import { BackRoomHeader, StatusTabs } from "../admin/BackRoomHeader";
import {
  AdminResponseError,
  archiveAdminGenre,
  createAdminGenre,
  getAdminGenres,
  restoreAdminGenre,
  updateAdminGenre,
} from "../admin/api";
import { useAuth } from "../auth/AuthProvider";

type LoadState = { status: "loading" } | { status: "ready"; genres: AdminGenre[] } | { status: "error"; message: string };

function messageFor(error: unknown, fallback: string) {
  return error instanceof AdminResponseError ? error.message : fallback;
}

export function AdminGenresPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const recordStatus: AdminRecordStatus = searchParams.get("status") === "archived" ? "archived" : "active";
  const [attempt, setAttempt] = useState(0);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [editing, setEditing] = useState<AdminGenre | "create" | null>(null);
  const [confirming, setConfirming] = useState<AdminGenre | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const archiveTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState({ status: "loading" });
    setMutationError(null);
    setEditing(null);

    getAdminGenres(recordStatus)
      .then((genres) => {
        if (!controller.signal.aborted) setLoadState({ status: "ready", genres });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof AdminResponseError && error.status === 401) {
          auth.expireSession();
          return;
        }
        setLoadState({
          status: "error",
          message: messageFor(error, "The genre drawer is unavailable. Try the request again."),
        });
      });
    return () => controller.abort();
  }, [attempt, auth, recordStatus]);

  function refresh(message: string) {
    setFeedback(message);
    setAttempt((value) => value + 1);
  }

  async function saveGenre(input: AdminGenreInput) {
    try {
      if (editing === "create") {
        await createAdminGenre(input);
        setEditing(null);
        refresh(`Created “${input.name}”.`);
        return;
      }
      if (editing) {
        await updateAdminGenre(editing.id, input);
        setEditing(null);
        refresh(`Updated “${input.name}”.`);
      }
    } catch (error: unknown) {
      if (error instanceof AdminResponseError && error.status === 401) auth.expireSession();
      throw error;
    }
  }

  async function confirmArchive() {
    if (!confirming) return;
    const genre = confirming;
    setBusyId(genre.id);
    setMutationError(null);
    try {
      await archiveAdminGenre(genre.id);
      setConfirming(null);
      setBusyId(null);
      refresh(`Archived “${genre.name}”. You can restore it from Archived.`);
    } catch (error: unknown) {
      if (error instanceof AdminResponseError && error.status === 401) {
        auth.expireSession();
      } else {
        setMutationError(messageFor(error, "The genre could not be archived. Try again."));
      }
      setConfirming(null);
      setBusyId(null);
    }
  }

  async function restore(genre: AdminGenre) {
    setBusyId(genre.id);
    setMutationError(null);
    try {
      await restoreAdminGenre(genre.id);
      setBusyId(null);
      refresh(`Restored “${genre.name}”.`);
    } catch (error: unknown) {
      if (error instanceof AdminResponseError && error.status === 401) {
        auth.expireSession();
      } else {
        setMutationError(messageFor(error, "The genre could not be restored. Try again."));
      }
      setBusyId(null);
    }
  }

  return (
    <main className="page-shell back-room-page" id="main-content">
      <BackRoomHeader description="Keep public browsing language useful, distinct, and recoverable." title="Genre vocabulary" />
      <div className="admin-toolbar">
        <StatusTabs section="genres" status={recordStatus} />
        {recordStatus === "active" ? <button className="button button--primary" onClick={() => setEditing("create")} type="button">Add genre</button> : null}
      </div>
      {feedback ? <p aria-live="polite" className="notice notice--success">{feedback}</p> : null}
      {mutationError ? <p className="notice admin-mutation-error" role="alert">{mutationError}</p> : null}

      {loadState.status === "ready" && editing !== null ? (
        <AdminGenreForm genre={editing === "create" ? null : editing} key={editing === "create" ? "create" : editing.id} onCancel={() => setEditing(null)} onSave={saveGenre} />
      ) : null}

      {loadState.status === "loading" ? (
        <section aria-live="polite" className="admin-state"><h2>Checking the vocabulary drawer…</h2></section>
      ) : loadState.status === "error" ? (
        <section className="admin-state"><h2>The genre drawer is unavailable.</h2><p role="alert">{loadState.message}</p><button className="button button--secondary" onClick={() => setAttempt((value) => value + 1)} type="button">Try again</button></section>
      ) : loadState.genres.length === 0 ? (
        <section className="admin-state"><h2>No {recordStatus} genres</h2><p>{recordStatus === "active" ? "Add the first browsing genre." : "Archived genres will wait here for restoration."}</p></section>
      ) : (
        <div className="admin-table-scroll" role="region" aria-label={`${recordStatus} genre records`} tabIndex={0}>
          <table className="admin-table admin-table--genres">
            <caption className="visually-hidden">{recordStatus === "active" ? "Active" : "Archived"} genre records</caption>
            <thead><tr><th scope="col">Name</th><th scope="col">Slug</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {loadState.genres.map((genre) => (
                <tr key={genre.id}>
                  <th scope="row"><span className="admin-record-title">{genre.name}</span></th>
                  <td className="admin-mono">{genre.slug}</td>
                  <td><div className="admin-row-actions">
                    {recordStatus === "active" ? (
                      <><button className="button button--quiet" onClick={() => setEditing(genre)} type="button">Edit <span className="visually-hidden">{genre.name}</span></button><button className="button button--quiet admin-danger" onClick={(event) => { archiveTriggerRef.current = event.currentTarget; setConfirming(genre); }} type="button">Archive <span className="visually-hidden">{genre.name}</span></button></>
                    ) : (
                      <button className="button button--secondary" disabled={busyId === genre.id} onClick={() => void restore(genre)} type="button">{busyId === genre.id ? "Restoring…" : <>Restore <span className="visually-hidden">{genre.name}</span></>}</button>
                    )}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirming ? <ArchiveConfirmation busy={busyId === confirming.id} kind="genre" name={confirming.name} onCancel={() => setConfirming(null)} onConfirm={() => void confirmArchive()} returnFocus={archiveTriggerRef.current} /> : null}
    </main>
  );
}
