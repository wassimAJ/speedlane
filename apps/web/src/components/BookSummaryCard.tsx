import type { CatalogueBookSummary } from "@amazon-2/contracts";
import { Link } from "react-router-dom";

import { BookCover } from "./BookCover";

export function BookSummaryCard({
  book,
  returnSearch,
}: {
  book: CatalogueBookSummary;
  returnSearch: string;
}) {
  const detailUrl = `/books/${book.id}?from=${encodeURIComponent(returnSearch)}`;
  const visibleGenres = book.genres.slice(0, 2);

  return (
    <li className="book-card">
      <Link
        aria-label={`Open ${book.title} by ${book.author}`}
        className="book-card__cover-link"
        tabIndex={-1}
        to={detailUrl}
      >
        <BookCover compact seed={book.coverSeed} />
      </Link>
      <div className="book-card__metadata">
        <h3><Link to={detailUrl}>{book.title}</Link></h3>
        <p className="book-card__author">{book.author}</p>
        <p className="book-card__facts">
          <span>{book.publicationYear}</span>
          <span aria-label={`Rated ${book.rating} out of 5`}>{book.rating.toFixed(1)} ★</span>
        </p>
        <div
          aria-label={`Genres: ${book.genres.map((genre) => genre.name).join(", ")}`}
          className="genre-list"
        >
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
