import {
  adminGenreInputSchema,
  type AdminGenre,
  type AdminGenreInput,
} from "@amazon-2/contracts";
import { useState, type FormEvent } from "react";

import { AdminResponseError } from "./api";
import { Field, FieldRow } from "./Field";
import { FormErrorSummary } from "./FormErrorSummary";

export function AdminGenreForm({
  genre,
  onCancel,
  onSave,
}: {
  genre: AdminGenre | null;
  onCancel(): void;
  onSave(input: AdminGenreInput): Promise<void>;
}) {
  const [name, setName] = useState(genre?.name ?? "");
  const [slug, setSlug] = useState(genre?.slug ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setServerError(null);
    const parsed = adminGenreInputSchema.safeParse({ name, slug });

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
        error instanceof AdminResponseError ? error.message : "The genre could not be saved. Try again.",
      );
      setSaving(false);
    }
  }

  const nameError = errors.name ? "Enter a genre name." : undefined;
  const slugError = errors.slug ? "Use lowercase letters, numbers, and single hyphens." : undefined;

  return (
    <section aria-labelledby="genre-form-title" className="admin-form-sheet admin-genre-form-sheet">
      <div className="admin-form-sheet__heading">
        <div>
          <p className="eyebrow">{genre ? "Edit vocabulary" : "New vocabulary"}</p>
          <h2 id="genre-form-title">{genre ? `Edit ${genre.name}` : "Add a genre"}</h2>
        </div>
        <button className="button button--quiet" disabled={saving} onClick={onCancel} type="button">Close</button>
      </div>
      {Object.keys(errors).length > 0 ? (
        <FormErrorSummary
          items={[
            ...(nameError ? [{ controlId: "admin-genre-name", label: "Name", message: nameError }] : []),
            ...(slugError ? [{ controlId: "admin-genre-slug", label: "Slug", message: slugError }] : []),
          ]}
        />
      ) : null}
      {serverError ? <p className="notice admin-form-error" role="alert">{serverError}</p> : null}
      <form className="admin-form admin-genre-form" noValidate onSubmit={(event) => void handleSubmit(event)}>
        <FieldRow paired>
          <Field controlId="admin-genre-name" error={nameError} label="Name">
            {(accessibility) => <input {...accessibility} id="admin-genre-name" maxLength={100} onChange={(event) => setName(event.target.value)} value={name} />}
          </Field>
          <Field controlId="admin-genre-slug" error={slugError} help="Lowercase words separated by hyphens." label="Slug">
            {(accessibility) => <input {...accessibility} id="admin-genre-slug" onChange={(event) => setSlug(event.target.value)} value={slug} />}
          </Field>
        </FieldRow>
        <FieldRow>
          <div className="admin-form__actions">
            <button className="button button--quiet" disabled={saving} onClick={onCancel} type="button">Cancel</button>
            <button className="button button--primary" disabled={saving} type="submit">
              {saving ? "Saving…" : genre ? "Save changes" : "Create genre"}
            </button>
          </div>
        </FieldRow>
      </form>
    </section>
  );
}
