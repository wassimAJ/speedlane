import {
  adminBookInputSchema,
  type AdminBook,
  type AdminBookInput,
  type AdminGenre,
} from "@amazon-2/contracts";
import { useState, type FormEvent } from "react";

import { AdminResponseError } from "./api";
import { Field, FieldRow, FieldSupport } from "./Field";
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

function visibleError(field: keyof BookDraft, errors: Record<string, string>) {
  const issue = errors[field];
  if (!issue) return undefined;
  return field === "isbn" || field === "subtitle" ? issue : bookFieldDetails[field].message;
}

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

  const errorFor = (field: keyof BookDraft) => visibleError(field, errors);
  const summaryItems = Object.keys(errors).flatMap<FormErrorSummaryItem>((candidate) => {
    if (!(candidate in bookFieldDetails)) return [];
    const field = candidate as keyof BookDraft;
    return [{ ...bookFieldDetails[field], message: errorFor(field) ?? bookFieldDetails[field].message }];
  });
  const genreError = errorFor("genreIds");

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
        <FieldRow>
          <Field controlId="admin-book-title" error={errorFor("title")} label="Title">
            {(accessibility) => <input {...accessibility} id="admin-book-title" maxLength={240} onChange={(event) => setField("title", event.target.value)} value={draft.title} />}
          </Field>
        </FieldRow>
        <FieldRow>
          <Field controlId="admin-book-subtitle" error={errorFor("subtitle")} label="Subtitle" labelSuffix={<span className="optional-label">Optional</span>}>
            {(accessibility) => <input {...accessibility} id="admin-book-subtitle" maxLength={320} onChange={(event) => setField("subtitle", event.target.value)} value={draft.subtitle} />}
          </Field>
        </FieldRow>
        <FieldRow paired>
          <Field controlId="admin-book-author" error={errorFor("author")} label="Author">
            {(accessibility) => <input {...accessibility} id="admin-book-author" maxLength={200} onChange={(event) => setField("author", event.target.value)} value={draft.author} />}
          </Field>
          <Field controlId="admin-book-isbn" error={errorFor("isbn")} help="ISBN-10 or ISBN-13, with or without hyphens." label="ISBN">
            {(accessibility) => <input {...accessibility} id="admin-book-isbn" maxLength={17} onChange={(event) => setField("isbn", event.target.value)} value={draft.isbn} />}
          </Field>
        </FieldRow>
        <FieldRow>
          <Field controlId="admin-book-synopsis" error={errorFor("synopsis")} label="Synopsis">
            {(accessibility) => <textarea {...accessibility} id="admin-book-synopsis" maxLength={20000} onChange={(event) => setField("synopsis", event.target.value)} rows={7} value={draft.synopsis} />}
          </Field>
        </FieldRow>
        <FieldRow paired>
          <Field controlId="admin-book-year" error={errorFor("publicationYear")} label="Publication year">
            {(accessibility) => <input {...accessibility} id="admin-book-year" inputMode="numeric" max={9999} min={1000} onChange={(event) => setField("publicationYear", event.target.value)} type="number" value={draft.publicationYear} />}
          </Field>
          <Field controlId="admin-book-pages" error={errorFor("pageCount")} label="Page count">
            {(accessibility) => <input {...accessibility} id="admin-book-pages" inputMode="numeric" max={100000} min={1} onChange={(event) => setField("pageCount", event.target.value)} type="number" value={draft.pageCount} />}
          </Field>
        </FieldRow>
        <FieldRow paired>
          <Field controlId="admin-book-language" error={errorFor("language")} label="Language">
            {(accessibility) => <input {...accessibility} id="admin-book-language" maxLength={80} onChange={(event) => setField("language", event.target.value)} value={draft.language} />}
          </Field>
          <Field controlId="admin-book-rating" error={errorFor("rating")} help="0 to 5, in 0.1 increments." label="Rating">
            {(accessibility) => <input {...accessibility} id="admin-book-rating" max={5} min={0} onChange={(event) => setField("rating", event.target.value)} step="0.1" type="number" value={draft.rating} />}
          </Field>
        </FieldRow>
        <FieldRow>
          <Field controlId="admin-book-cover" error={errorFor("coverSeed")} label="Cover seed">
            {(accessibility) => <input {...accessibility} id="admin-book-cover" maxLength={120} onChange={(event) => setField("coverSeed", event.target.value)} value={draft.coverSeed} />}
          </Field>
        </FieldRow>
        <FieldRow>
          <fieldset aria-describedby={genreError ? "admin-book-genres-error" : undefined} aria-invalid={genreError ? true : undefined} className="admin-genres" id="admin-book-genres" tabIndex={-1}>
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
            <FieldSupport controlId="admin-book-genres" error={genreError} reserve />
          </fieldset>
        </FieldRow>
        <FieldRow>
          <div className="admin-form__actions">
            <button className="button button--quiet" disabled={saving} onClick={onCancel} type="button">Cancel</button>
            <button className="button button--primary" disabled={saving || genres.length === 0} type="submit">
              {saving ? "Saving…" : book ? "Save changes" : "Create book"}
            </button>
          </div>
        </FieldRow>
      </form>
    </section>
  );
}
