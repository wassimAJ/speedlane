import {
  adminBookInputSchema,
  type AdminBook,
  type AdminBookInput,
  type AdminGenre,
} from "@amazon-2/contracts";
import { useState, type FormEvent } from "react";

import { AdminResponseError } from "./api";
import { FormErrorSummary, type FormErrorSummaryItem } from "./FormErrorSummary";

interface BookDraft {
  title: string;
  subtitle: string;
  author: string;
  synopsis: string;
  isbn: string;
  publicationYear: string;
  pageCount: string;
  language: string;
  rating: string;
  coverSeed: string;
  genreIds: string[];
}

function draftFor(book: AdminBook | null): BookDraft {
  return book
    ? {
        title: book.title,
        subtitle: book.subtitle ?? "",
        author: book.author,
        synopsis: book.synopsis,
        isbn: book.isbn,
        publicationYear: String(book.publicationYear),
        pageCount: String(book.pageCount),
        language: book.language,
        rating: String(book.rating),
        coverSeed: book.coverSeed,
        genreIds: book.genres.filter((genre) => genre.archivedAt === null).map((genre) => genre.id),
      }
    : {
        title: "",
        subtitle: "",
        author: "",
        synopsis: "",
        isbn: "",
        publicationYear: "",
        pageCount: "",
        language: "",
        rating: "",
        coverSeed: "",
        genreIds: [],
      };
}

function numericValue(value: string) {
  return value.trim() === "" ? Number.NaN : Number(value);
}

const bookFieldDetails: Record<keyof BookDraft, { controlId: string; label: string; message: string }> = {
  title: { controlId: "admin-book-title", label: "Title", message: "Enter a title." },
  subtitle: { controlId: "admin-book-subtitle", label: "Subtitle", message: "Enter a subtitle." },
  author: { controlId: "admin-book-author", label: "Author", message: "Enter an author." },
  synopsis: { controlId: "admin-book-synopsis", label: "Synopsis", message: "Enter a synopsis." },
  isbn: { controlId: "admin-book-isbn", label: "ISBN", message: "ISBN checksum is invalid." },
  publicationYear: { controlId: "admin-book-year", label: "Publication year", message: "Enter a four-digit year." },
  pageCount: { controlId: "admin-book-pages", label: "Page count", message: "Enter at least one page." },
  language: { controlId: "admin-book-language", label: "Language", message: "Enter a language." },
  rating: { controlId: "admin-book-rating", label: "Rating", message: "Enter a rating from 0 to 5 in 0.1 increments." },
  coverSeed: { controlId: "admin-book-cover", label: "Cover seed", message: "Enter a cover seed." },
  genreIds: { controlId: "admin-book-genres", label: "Genres", message: "Choose at least one active genre." },
};

export function AdminBookForm({
  book,
  genres,
  onCancel,
  onSave,
}: {
  book: AdminBook | null;
  genres: AdminGenre[];
  onCancel(): void;
  onSave(input: AdminBookInput): Promise<void>;
}) {
  const [draft, setDraft] = useState<BookDraft>(() => draftFor(book));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setField(field: keyof BookDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function toggleGenre(genreId: string) {
    setDraft((current) => ({
      ...current,
      genreIds: current.genreIds.includes(genreId)
        ? current.genreIds.filter((id) => id !== genreId)
        : [...current.genreIds, genreId],
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);

    const parsed = adminBookInputSchema.safeParse({
      title: draft.title,
      subtitle: draft.subtitle.trim() === "" ? null : draft.subtitle,
      author: draft.author,
      synopsis: draft.synopsis,
      isbn: draft.isbn,
      publicationYear: numericValue(draft.publicationYear),
      pageCount: numericValue(draft.pageCount),
      language: draft.language,
      rating: numericValue(draft.rating),
      coverSeed: draft.coverSeed,
      genreIds: draft.genreIds,
    });

    if (!parsed.success) {
      const nextErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "form");
        nextErrors[field] ??= issue.message;
      }
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      await onSave(parsed.data);
    } catch (error: unknown) {
      setServerError(
        error instanceof AdminResponseError ? error.message : "The book could not be saved. Try again.",
      );
      setSaving(false);
    }
  }

  const errorFor = (field: keyof BookDraft) => errors[field];
  const errorId = (field: keyof BookDraft) => `admin-book-${field}-error`;
  const describedBy = (field: keyof BookDraft, hintId?: string) =>
    [hintId, errorFor(field) ? errorId(field) : undefined].filter(Boolean).join(" ") || undefined;
  const summaryItems = (Object.keys(errors) as (keyof BookDraft)[]).map<FormErrorSummaryItem>(
    (field) => ({
      ...bookFieldDetails[field],
      message: field === "isbn" ? (errors[field] ?? bookFieldDetails[field].message) : bookFieldDetails[field].message,
    }),
  );

  return (
    <section aria-labelledby="book-form-title" className="admin-form-sheet">
      <div className="admin-form-sheet__heading">
        <div>
          <p className="eyebrow">{book ? "Edit record" : "New accession"}</p>
          <h2 id="book-form-title">{book ? `Edit ${book.title}` : "Add a book"}</h2>
        </div>
        <button className="button button--quiet" disabled={saving} onClick={onCancel} type="button">
          Close
        </button>
      </div>
      {summaryItems.length > 0 ? <FormErrorSummary items={summaryItems} /> : null}
      {serverError ? <p className="notice admin-form-error" role="alert">{serverError}</p> : null}
      <form className="admin-form admin-book-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <div className="field admin-field--wide">
          <label htmlFor="admin-book-title">Title</label>
          <input aria-describedby={describedBy("title")} aria-invalid={Boolean(errorFor("title"))} id="admin-book-title" maxLength={240} onChange={(event) => setField("title", event.target.value)} value={draft.title} />
          {errorFor("title") ? <span className="form-error" id={errorId("title")}><span className="visually-hidden">Error: </span>Enter a title.</span> : null}
        </div>
        <div className="field admin-field--wide">
          <label htmlFor="admin-book-subtitle">Subtitle <span className="optional-label">Optional</span></label>
          <input aria-describedby={describedBy("subtitle")} aria-invalid={Boolean(errorFor("subtitle"))} id="admin-book-subtitle" maxLength={320} onChange={(event) => setField("subtitle", event.target.value)} value={draft.subtitle} />
          {errorFor("subtitle") ? <span className="form-error" id={errorId("subtitle")}><span className="visually-hidden">Error: </span>{errorFor("subtitle")}</span> : null}
        </div>
        <div className="field">
          <label htmlFor="admin-book-author">Author</label>
          <input aria-describedby={describedBy("author")} aria-invalid={Boolean(errorFor("author"))} id="admin-book-author" maxLength={200} onChange={(event) => setField("author", event.target.value)} value={draft.author} />
          {errorFor("author") ? <span className="form-error" id={errorId("author")}><span className="visually-hidden">Error: </span>Enter an author.</span> : null}
        </div>
        <div className="field">
          <label htmlFor="admin-book-isbn">ISBN</label>
          <input aria-describedby={describedBy("isbn", "admin-book-isbn-hint")} aria-invalid={Boolean(errorFor("isbn"))} id="admin-book-isbn" maxLength={17} onChange={(event) => setField("isbn", event.target.value)} value={draft.isbn} />
          <span className="field-hint" id="admin-book-isbn-hint">ISBN-10 or ISBN-13, with or without hyphens.</span>
          {errorFor("isbn") ? <span className="form-error" id={errorId("isbn")}><span className="visually-hidden">Error: </span>{errorFor("isbn")}</span> : null}
        </div>
        <div className="field admin-field--wide">
          <label htmlFor="admin-book-synopsis">Synopsis</label>
          <textarea aria-describedby={describedBy("synopsis")} aria-invalid={Boolean(errorFor("synopsis"))} id="admin-book-synopsis" maxLength={20000} onChange={(event) => setField("synopsis", event.target.value)} rows={7} value={draft.synopsis} />
          {errorFor("synopsis") ? <span className="form-error" id={errorId("synopsis")}><span className="visually-hidden">Error: </span>Enter a synopsis.</span> : null}
        </div>
        <div className="field">
          <label htmlFor="admin-book-year">Publication year</label>
          <input aria-describedby={describedBy("publicationYear")} aria-invalid={Boolean(errorFor("publicationYear"))} id="admin-book-year" inputMode="numeric" max={9999} min={1000} onChange={(event) => setField("publicationYear", event.target.value)} type="number" value={draft.publicationYear} />
          {errorFor("publicationYear") ? <span className="form-error" id={errorId("publicationYear")}><span className="visually-hidden">Error: </span>Enter a four-digit year.</span> : null}
        </div>
        <div className="field">
          <label htmlFor="admin-book-pages">Page count</label>
          <input aria-describedby={describedBy("pageCount")} aria-invalid={Boolean(errorFor("pageCount"))} id="admin-book-pages" inputMode="numeric" max={100000} min={1} onChange={(event) => setField("pageCount", event.target.value)} type="number" value={draft.pageCount} />
          {errorFor("pageCount") ? <span className="form-error" id={errorId("pageCount")}><span className="visually-hidden">Error: </span>Enter at least one page.</span> : null}
        </div>
        <div className="field">
          <label htmlFor="admin-book-language">Language</label>
          <input aria-describedby={describedBy("language")} aria-invalid={Boolean(errorFor("language"))} id="admin-book-language" maxLength={80} onChange={(event) => setField("language", event.target.value)} value={draft.language} />
          {errorFor("language") ? <span className="form-error" id={errorId("language")}><span className="visually-hidden">Error: </span>Enter a language.</span> : null}
        </div>
        <div className="field">
          <label htmlFor="admin-book-rating">Rating</label>
          <input aria-describedby={describedBy("rating", "admin-book-rating-hint")} aria-invalid={Boolean(errorFor("rating"))} id="admin-book-rating" max={5} min={0} onChange={(event) => setField("rating", event.target.value)} step="0.1" type="number" value={draft.rating} />
          <span className="field-hint" id="admin-book-rating-hint">0 to 5, in 0.1 increments.</span>
          {errorFor("rating") ? <span className="form-error" id={errorId("rating")}><span className="visually-hidden">Error: </span>Enter a rating from 0 to 5 in 0.1 increments.</span> : null}
        </div>
        <div className="field admin-field--wide">
          <label htmlFor="admin-book-cover">Cover seed</label>
          <input aria-describedby={describedBy("coverSeed")} aria-invalid={Boolean(errorFor("coverSeed"))} id="admin-book-cover" maxLength={120} onChange={(event) => setField("coverSeed", event.target.value)} value={draft.coverSeed} />
          {errorFor("coverSeed") ? <span className="form-error" id={errorId("coverSeed")}><span className="visually-hidden">Error: </span>Enter a cover seed.</span> : null}
        </div>
        <fieldset aria-describedby={describedBy("genreIds")} aria-invalid={Boolean(errorFor("genreIds"))} className="admin-genres admin-field--wide" id="admin-book-genres" tabIndex={-1}>
          <legend>Genres <span aria-hidden="true">·</span> Choose one or more active genres</legend>
          {genres.length === 0 ? (
            <p className="notice">No active genres are available. Add or restore a genre first.</p>
          ) : (
            <div className="admin-genre-options">
              {genres.map((genre) => (
                <label key={genre.id}>
                  <input checked={draft.genreIds.includes(genre.id)} onChange={() => toggleGenre(genre.id)} type="checkbox" />
                  <span>{genre.name}</span>
                </label>
              ))}
            </div>
          )}
          {errorFor("genreIds") ? <span className="form-error" id={errorId("genreIds")}><span className="visually-hidden">Error: </span>Choose at least one active genre.</span> : null}
        </fieldset>
        <div className="admin-form__actions admin-field--wide">
          <button className="button button--quiet" disabled={saving} onClick={onCancel} type="button">Cancel</button>
          <button className="button button--primary" disabled={saving || genres.length === 0} type="submit">
            {saving ? "Saving…" : book ? "Save changes" : "Create book"}
          </button>
        </div>
      </form>
    </section>
  );
}
