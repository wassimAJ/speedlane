import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { BookSummaryCard } from "./components/BookSummaryCard";

const book = {
  id: "20000000-0000-4000-8000-000000000001",
  title: "The Unwritten Atlas",
  author: "Morgan Laurent",
  publicationYear: 2024,
  rating: 4.7,
  coverSeed: "atlas-240",
  genres: [
    { id: "10000000-0000-4000-8000-000000000001", name: "Fantasy", slug: "fantasy" },
    { id: "10000000-0000-4000-8000-000000000002", name: "Mystery", slug: "mystery" },
    { id: "10000000-0000-4000-8000-000000000003", name: "History", slug: "history" },
    { id: "10000000-0000-4000-8000-000000000004", name: "Adventure", slug: "adventure" },
  ],
};

describe("BookSummaryCard genres", () => {
  it("exposes every genre to assistive technology while keeping visual chips truncated", () => {
    const { container } = render(
      <MemoryRouter>
        <ul>
          <BookSummaryCard book={book} returnSearch="" />
        </ul>
      </MemoryRouter>,
    );

    const fullGenres = screen.getByText("Genres: Fantasy, Mystery, History, Adventure");
    expect(fullGenres).toHaveClass("visually-hidden");
    expect(fullGenres).not.toHaveAttribute("aria-hidden");

    const visualGenres = container.querySelector<HTMLElement>(".genre-list");
    expect(visualGenres).not.toBeNull();
    expect(visualGenres).toHaveAttribute("aria-hidden", "true");
    expect(within(visualGenres!).getByText("Fantasy")).toBeInTheDocument();
    expect(within(visualGenres!).getByText("Mystery")).toBeInTheDocument();
    expect(within(visualGenres!).getByText("+2 more")).toBeInTheDocument();
    expect(within(visualGenres!).queryByText("History")).not.toBeInTheDocument();
    expect(within(visualGenres!).queryByText("Adventure")).not.toBeInTheDocument();
  });
});
