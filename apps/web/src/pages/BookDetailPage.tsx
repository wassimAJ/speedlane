import {
  bookIdParamsSchema,
  catalogueBookDetailResponseSchema,
  type CatalogueBookDetailResponse,
} from "@amazon-2/contracts";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { ApiResponseError, isUnauthenticated, requestJson } from "../api";
import { useAuth } from "../auth/AuthProvider";
import { safeReturnCatalogueSearch } from "../catalogue/query";
import { BookCover } from "../components/BookCover";
import { ReadingListControls } from "../components/ReadingListControls";

type DetailState =
  | { kind: "loading" }
  | { kind: "ready"; data: CatalogueBookDetailResponse }
  | { kind: "unavailable" }
  | { kind: "error" };

export function BookDetailPage() {
  const auth = useAuth();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const returnSearch = useMemo(
    () => safeReturnCatalogueSearch(searchParams.get("from")),
    [searchParams],
  );
  const backTo = `/catalogue${returnSearch}`;
  const parsedParams = useMemo(
    () => bookIdParamsSchema.safeParse({ bookId: params.bookId }),
    [params.bookId],
  );
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DetailState>({ kind: "loading" });

  useEffect(() => {
    if (!parsedParams.success) {
      setState({ kind: "unavailable" });
      return;
    }

    const controller = new AbortController();
    setState({ kind: "loading" });

    requestJson(
      `/api/books/${encodeURIComponent(parsedParams.data.bookId)}`,
      catalogueBookDetailResponseSchema,
      { signal: controller.signal },
    )
      .then((data) => setState({ kind: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isUnauthenticated(error)) {
          auth.expireSession();
          return;
        }
        if (error instanceof ApiResponseError && (error.status === 400 || error.status === 404)) {
          setState({ kind: "unavailable" });
          return;
        }
        setState({ kind: "error" });
      });

    return () => controller.abort();
  }, [attempt, auth.expireSession, parsedParams]);

  if (state.kind === "loading") {
    return (
      <main className="page-shell" id="main-content">
        <Link className="back-link" to={backTo}>← Back to catalogue</Link>
        <div aria-live="polite" className="detail-layout detail-layout--loading">
          <div aria-hidden="true" className="skeleton skeleton--detail-cover" />
          <div>
            <p className="eyebrow">OPEN STACKS RECORD</p>
            <h1>Loading book…</h1>
            <div aria-hidden="true" className="skeleton skeleton--line skeleton--long" />
          </div>
        </div>
      </main>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <main className="page-shell" id="main-content">
        <div className="centred-state centred-state--within-page">
          <p className="eyebrow">OPEN STACKS RECORD</p>
          <h1>This book is not available.</h1>
          <p>It may have moved out of the open stacks.</p>
          <Link className="button button--secondary" to={backTo}>Back to catalogue</Link>
        </div>
      </main>
    );
  }

  if (state.kind === "error") {
    return (
      <main className="page-shell" id="main-content">
        <Link className="back-link" to={backTo}>← Back to catalogue</Link>
        <div className="centred-state centred-state--within-page">
          <p className="eyebrow">CONNECTION NOTICE</p>
          <h1>Something slipped between the shelves.</h1>
          <p>We couldn’t load this book.</p>
          <button className="button button--primary" onClick={() => setAttempt((value) => value + 1)} type="button">
            Try again
          </button>
        </div>
      </main>
    );
  }

  const { book } = state.data;

  return (
    <main className="page-shell" id="main-content">
      <Link className="back-link" to={backTo}>← Back to catalogue</Link>
      <article className="detail-layout">
        <div className="detail-cover-wrap">
          <BookCover seed={book.coverSeed} />
        </div>
        <div className="detail-content">
          <p className="eyebrow">OPEN STACKS RECORD</p>
          <h1>{book.title}</h1>
          {book.subtitle ? <p className="detail-subtitle">{book.subtitle}</p> : null}
          <p className="detail-author">by {book.author}</p>
          <div className="genre-list detail-genres" aria-label={`Genres: ${book.genres.map((genre) => genre.name).join(", ")}`}>
            {book.genres.map((genre) => (
              <Link className="genre-chip genre-chip--link" key={genre.id} to={`/catalogue?genre=${genre.slug}`}>
                {genre.name}
              </Link>
            ))}
          </div>
          <p className="detail-rating" aria-label={`Rated ${book.rating} out of 5`}>
            {book.rating.toFixed(1)} ★
          </p>

          <ReadingListControls bookId={book.id} />

          <section aria-labelledby="synopsis-heading" className="synopsis">
            <h2 id="synopsis-heading">About this book</h2>
            <p>{book.synopsis}</p>
          </section>

          <section aria-labelledby="publication-heading" className="publication-facts">
            <h2 id="publication-heading">Publication facts</h2>
            <dl>
              <div><dt>ISBN</dt><dd>{book.isbn}</dd></div>
              <div><dt>Publication year</dt><dd>{book.publicationYear}</dd></div>
              <div><dt>Page count</dt><dd>{book.pageCount}</dd></div>
              <div><dt>Language</dt><dd>{book.language}</dd></div>
            </dl>
          </section>
        </div>
      </article>
    </main>
  );
}
