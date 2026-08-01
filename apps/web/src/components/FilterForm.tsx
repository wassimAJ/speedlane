import type { FormEvent, RefObject } from "react";
import type { GenreSummary } from "@amazon-2/contracts";

export interface FilterDraft {
  genre: string;
  yearFrom: string;
  yearTo: string;
}

interface FilterFormProps {
  draft: FilterDraft;
  error: string | null;
  genres: GenreSummary[];
  genresError: boolean;
  isResetDisabled: boolean;
  firstControlRef?: RefObject<HTMLSelectElement | null>;
  onApply(event: FormEvent<HTMLFormElement>): void;
  onChange(draft: FilterDraft): void;
  onReset(): void;
  onRetryGenres(): void;
}

export function FilterForm({
  draft,
  error,
  genres,
  genresError,
  isResetDisabled,
  firstControlRef,
  onApply,
  onChange,
  onReset,
  onRetryGenres,
}: FilterFormProps) {
  return (
    <form className="filter-form" noValidate onSubmit={onApply}>
      <div className="field">
        <label htmlFor="genre-filter">Genre</label>
        <select
          id="genre-filter"
          onChange={(event) => onChange({ ...draft, genre: event.target.value })}
          ref={firstControlRef}
          value={draft.genre}
        >
          <option value="">All genres</option>
          {genres.map((genre) => (
            <option key={genre.id} value={genre.slug}>
              {genre.name}
            </option>
          ))}
        </select>
      </div>

      {genresError ? (
        <div className="inline-error">
          <p>Genres are unavailable right now.</p>
          <button className="button button--quiet" onClick={onRetryGenres} type="button">
            Try again
          </button>
        </div>
      ) : null}

      <fieldset aria-describedby={error ? "year-error" : undefined} className="year-fields">
        <legend>Publication year</legend>
        <div className="year-fields__inputs">
          <div className="field">
            <label htmlFor="year-from">From year</label>
            <input
              aria-invalid={error ? "true" : undefined}
              id="year-from"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => onChange({ ...draft, yearFrom: event.target.value })}
              pattern="[0-9]{4}"
              value={draft.yearFrom}
            />
          </div>
          <div className="field">
            <label htmlFor="year-to">To year</label>
            <input
              aria-invalid={error ? "true" : undefined}
              id="year-to"
              inputMode="numeric"
              maxLength={4}
              onChange={(event) => onChange({ ...draft, yearTo: event.target.value })}
              pattern="[0-9]{4}"
              value={draft.yearTo}
            />
          </div>
        </div>
        {error ? (
          <p className="form-error" id="year-error" role="alert">
            Error: {error}
          </p>
        ) : null}
      </fieldset>

      <div className="filter-form__actions">
        <button className="button button--primary" type="submit">
          Apply filters
        </button>
        <button
          className="button button--quiet"
          disabled={isResetDisabled}
          onClick={onReset}
          type="button"
        >
          Reset all
        </button>
      </div>
    </form>
  );
}
