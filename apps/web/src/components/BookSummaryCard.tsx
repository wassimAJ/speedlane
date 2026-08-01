import type { CatalogueBookSummary } from "@amazon-2/contracts";
import { Link } from "react-router-dom";

import { BookCover } from "./BookCover";

export function BookSummaryCard({
  book,
  isAppended = false,
  onNavigate,
  returnSearch,
}: {
  book: CatalogueBookSummary;
  isAppended?: boolean;
  onNavigate?(bookId: string): void;
  returnSearch: string;
}) {
  const detailUrl = `/books/${book.id}?from=${encodeURIComponent(returnSearch)}`;
  const visibleGenres = book.genres.slice(0, 2);

  return (
    <li
      className={isAppended ? "book-card book-card--appended" : "book-card"}
      id={onNavigate ? `catalogue-book-${book.id}` : undefined}
    >
      <Link
        aria-label={`Open ${book.title} by ${book.author}`}
        className="book-card__cover-link"
        onClick={() => onNavigate?.(book.id)}
        tabIndex={-1}
        to={detailUrl}
      >
        <BookCover compact seed={book.coverSeed} />
      </Link>
      <div className="book-card__metadata">
        <h3>
          <Link data-book-title-link onClick={() => onNavigate?.(book.id)} to={detailUrl}>
            {book.title}
          </Link>
        </h3>
        <p className="book-card__author">{book.author}</p>
        <p className="book-card__facts">
          <span>{book.publicationYear}</span>
          <span aria-label={`Rated ${book.rating} out of 5`}>{book.rating.toFixed(1)} ★</span>
        </p>
        <p className="visually-hidden">
          Genres: {book.genres.map((genre) => genre.name).join(", ")}
        </p>
        <div aria-hidden="true" className="genre-list">
          {visibleGenres.map((genre) => (
            <span className="genre-chip" key={genre.id}>{genre.name}</span>
          ))}
          {book.genres.length > 2 ? (
            <span className="genre-more">+{book.genres.length - 2} more</span>
          ) : null}
        </div>
      </div>
    </li>
  );
}
