import type { PublicBookPreview } from "@amazon-2/contracts";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { BookCover } from "../components/BookCover";
import { OffsetIndexMark } from "../components/OffsetIndexMark";
import { getPublicDiscovery } from "../discovery/api";

type DiscoveryState =
  | { status: "loading" }
  | { status: "ready"; books: PublicBookPreview[] }
  | { status: "error" };

function PublicPreview({ book, position }: { book: PublicBookPreview; position: number }) {
  return (
    <li aria-labelledby={`public-preview-title-${position}`} className="public-preview">
      <div className="public-preview__cover">
        <BookCover posterTitle={book.title} seed={book.coverSeed} />
      </div>
      <div className="public-preview__metadata">
        <h3 id={`public-preview-title-${position}`}>{book.title}</h3>
        <p className="public-preview__author">by {book.author}</p>
        <ul aria-label={`Genres for ${book.title}`} className="public-preview__genres">
          {book.genres.map((genre) => (
            <li key={genre}>{genre}</li>
          ))}
        </ul>
      </div>
    </li>
  );
}

function DiscoveryLoading() {
  return (
    <div aria-busy="true" className="public-discovery-state">
      <p className="public-discovery-status" role="status">
        Loading the public shelves…
      </p>
      <ul aria-hidden="true" className="public-preview-list public-preview-list--loading">
        {Array.from({ length: 6 }, (_, index) => (
          <li className="public-preview" key={index}>
            <div className="public-preview__cover public-preview__cover--loading" />
            <div className="public-preview__loading-line" />
            <div className="public-preview__loading-line public-preview__loading-line--short" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PublicLandingPage() {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<DiscoveryState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });

    getPublicDiscovery(controller.signal)
      .then((books) => {
        if (!controller.signal.aborted) setState({ status: "ready", books });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });

    return () => controller.abort();
  }, [attempt]);

  return (
    <div className="public-page">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <main id="main-content">
        <section aria-labelledby="public-hero-title" className="public-poster">
          <div className="public-poster__inner">
            <header className="public-masthead">
              <div className="public-wordmark">
                <OffsetIndexMark className="public-wordmark__mark" size={64} />
                <span>Amazon 2.0</span>
              </div>
            </header>

            <div className="public-poster__composition">
              <div className="public-hero-copy">
                <p className="eyebrow">The next chapter is on the shelf</p>
                <h1 id="public-hero-title">A library, reshuffled.</h1>
                <p className="public-hero-copy__lede">
                  Discover the latest arrivals, then sign in to search the full collection and
                  keep a personal reading list.
                </p>
                <div className="public-account-actions">
                  <Link className="button button--primary" to="/sign-up">
                    Create a reader account
                  </Link>
                  <Link className="button button--secondary" to="/sign-in">
                    Sign in
                  </Link>
                </div>
                <p className="public-disclaimer">
                  Amazon 2.0 is an independent library platform and is not affiliated with Amazon.
                </p>
              </div>

              <section aria-labelledby="public-discovery-title" className="public-discovery">
                <div className="public-discovery__heading">
                  <div>
                    <p className="eyebrow">New arrivals · Six on view</p>
                    <h2 id="public-discovery-title">Fresh from the stacks</h2>
                  </div>
                  <p>Read-only previews from the active collection.</p>
                </div>

                {state.status === "loading" ? <DiscoveryLoading /> : null}
                {state.status === "error" ? (
                  <div className="public-discovery-state public-discovery-state--error" role="alert">
                    <h3>We couldn’t load the public shelves.</h3>
                    <p>Check your connection and try again.</p>
                    <button
                      className="button button--secondary"
                      onClick={() => setAttempt((current) => current + 1)}
                      type="button"
                    >
                      Try again
                    </button>
                  </div>
                ) : null}
                {state.status === "ready" && state.books.length === 0 ? (
                  <div className="public-discovery-state">
                    <h3>The public shelf is quiet.</h3>
                    <p>Check back after the librarian adds a book.</p>
                  </div>
                ) : null}
                {state.status === "ready" && state.books.length > 0 ? (
                  <ul aria-label="Newest books" className="public-preview-list">
                    {state.books.map((book, index) => (
                      <PublicPreview book={book} key={`${book.coverSeed}-${book.title}`} position={index + 1} />
                    ))}
                  </ul>
                ) : null}
              </section>
            </div>
          </div>
        </section>

        <section aria-labelledby="public-closing-title" className="public-closing">
          <div className="public-closing__inner">
            <p className="eyebrow">MEMBER ACCESS</p>
            <h2 id="public-closing-title">The rest of the collection is inside.</h2>
            <p>Sign in with your library card to browse, filter, and build your shelf.</p>
            <Link className="button button--secondary" to="/sign-in">
              Sign in to browse
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
