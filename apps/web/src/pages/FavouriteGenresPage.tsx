import {
  MAX_FAVOURITE_GENRES,
  genresResponseSchema,
  type GenreSummary,
} from "@amazon-2/contracts";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";

import { isUnauthenticated, requestJson } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { getFavouriteGenres, replaceFavouriteGenres } from "../engagement/api";

type PreferencesState =
  | { kind: "loading" }
  | { kind: "ready"; genres: GenreSummary[] }
  | { kind: "error" };

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function FavouriteGenresPage() {
  const auth = useAuth();
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<PreferencesState>({ kind: "loading" });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: "loading" });
    setSaveError(null);

    Promise.all([
      requestJson("/api/genres", genresResponseSchema, { signal: controller.signal }),
      getFavouriteGenres(controller.signal),
    ])
      .then(([activeGenres, favourites]) => {
        const activeIds = new Set(activeGenres.genres.map((genre) => genre.id));
        const orderedIds = favourites.genres
          .map((genre) => genre.id)
          .filter((genreId) => activeIds.has(genreId));
        setState({ kind: "ready", genres: activeGenres.genres });
        setSelectedIds(orderedIds);
        setSavedIds(orderedIds);
        setSelectionError(null);
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

  const genresById = useMemo(
    () => new Map(state.kind === "ready" ? state.genres.map((genre) => [genre.id, genre]) : []),
    [state],
  );
  const isDirty = !arraysEqual(selectedIds, savedIds);
  const limitReached = selectedIds.length >= MAX_FAVOURITE_GENRES;

  function toggleGenre(event: ChangeEvent<HTMLInputElement>, genreId: string) {
    setSaveMessage(null);
    setSaveError(null);

    if (event.target.checked) {
      if (selectedIds.length >= MAX_FAVOURITE_GENRES) {
        setSelectionError(`Choose no more than ${MAX_FAVOURITE_GENRES} favourite genres.`);
        return;
      }
      setSelectedIds((current) => [...current, genreId]);
    } else {
      setSelectedIds((current) => current.filter((id) => id !== genreId));
    }
    setSelectionError(null);
  }

  function moveGenre(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= selectedIds.length) return;

    setSelectedIds((current) => {
      const next = [...current];
      const [moved] = next.splice(index, 1);
      if (moved === undefined) return current;
      next.splice(destination, 0, moved);
      return next;
    });
    setSaveMessage(null);
    setSaveError(null);
  }

  async function savePreferences() {
    setSelectionError(null);
    setSaveMessage(null);
    setSaveError(null);
    setIsSaving(true);

    try {
      const response = await replaceFavouriteGenres({ genreIds: selectedIds });
      const ids = response.genres.map((genre) => genre.id);
      setSelectedIds(ids);
      setSavedIds(ids);
      setSaveMessage("Favourite genres saved.");
    } catch (error: unknown) {
      if (isUnauthenticated(error)) {
        auth.expireSession();
        return;
      }
      setSaveError("We couldn’t save your favourite genres. Try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <main className="page-shell" id="main-content">
        <header className="page-heading">
          <p className="eyebrow">YOUR LIBRARY CARD</p>
          <h1>Favourite genres</h1>
          <p>Loading the active genre shelves…</p>
        </header>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="page-shell" id="main-content">
        <div className="centred-state centred-state--within-page">
          <p className="eyebrow">CONNECTION NOTICE</p>
          <h1>We couldn’t load your favourite genres.</h1>
          <p>Check your connection and try again.</p>
          <button className="button button--primary" onClick={() => setAttempt((value) => value + 1)} type="button">
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="page-shell preferences-page" id="main-content">
      <header className="page-heading">
        <p className="eyebrow">YOUR LIBRARY CARD</p>
        <h1>Favourite genres</h1>
        <p>Choose up to five active genres. Their order shapes your personalised picks.</p>
      </header>

      <div className="preferences-layout">
        <section aria-labelledby="genre-options-heading" className="preference-options">
          <div className="section-heading-row">
            <div>
              <h2 id="genre-options-heading">Choose genres</h2>
              <p>{selectedIds.length} of {MAX_FAVOURITE_GENRES} selected</p>
            </div>
          </div>
          {state.genres.length === 0 ? (
            <p className="notice notice--info">No active genres are available right now.</p>
          ) : (
            <fieldset className="genre-checkboxes">
              <legend className="visually-hidden">Active genres</legend>
              {state.genres.map((genre) => {
                const checked = selectedIds.includes(genre.id);
                return (
                  <label className="genre-checkbox" key={genre.id}>
                    <input
                      checked={checked}
                      disabled={!checked && limitReached}
                      onChange={(event) => toggleGenre(event, genre.id)}
                      type="checkbox"
                    />
                    <span>{genre.name}</span>
                  </label>
                );
              })}
            </fieldset>
          )}
          {limitReached ? (
            <p className="selection-limit" role="status">
              Maximum selected. Remove one genre to choose another.
            </p>
          ) : null}
          {selectionError ? <p className="form-error" role="alert">Error: {selectionError}</p> : null}
        </section>

        <section aria-labelledby="preference-order-heading" className="preference-order">
          <div className="section-heading-row">
            <div>
              <h2 id="preference-order-heading">Your preference order</h2>
              <p>Recommendations follow this order before sorting newest within each genre.</p>
            </div>
          </div>
          {selectedIds.length === 0 ? (
            <p className="preference-order__empty">No favourite genres selected.</p>
          ) : (
            <ol className="preference-order__list">
              {selectedIds.map((genreId, index) => {
                const genre = genresById.get(genreId);
                if (genre === undefined) return null;
                return (
                  <li key={genre.id}>
                    <span className="preference-position" aria-hidden="true">{index + 1}</span>
                    <span className="preference-name">{genre.name}</span>
                    <div className="preference-order__actions">
                      <button
                        aria-label={`Move ${genre.name} up`}
                        className="button button--secondary button--compact"
                        disabled={index === 0}
                        onClick={() => moveGenre(index, -1)}
                        type="button"
                      >
                        Move up
                      </button>
                      <button
                        aria-label={`Move ${genre.name} down`}
                        className="button button--secondary button--compact"
                        disabled={index === selectedIds.length - 1}
                        onClick={() => moveGenre(index, 1)}
                        type="button"
                      >
                        Move down
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          <div className="preference-save">
            <button
              className="button button--primary"
              disabled={!isDirty || isSaving}
              onClick={() => void savePreferences()}
              type="button"
            >
              {isSaving ? "Saving…" : "Save favourites"}
            </button>
            <p aria-live="polite" className="preference-save__status">
              {saveMessage ?? ""}
            </p>
            {saveError ? <p className="form-error" role="alert">Error: {saveError}</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
