import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "reader@amazon2.local",
  displayName: "Riley Reader",
  role: "READER" as const,
};

const genres = [
  ["Science Fiction", "science-fiction"],
  ["Mystery", "mystery"],
  ["Fantasy", "fantasy"],
  ["History", "history"],
  ["Poetry", "poetry"],
  ["Travel", "travel"],
].map(([name, slug], index) => ({
  id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name: name!,
  slug: slug!,
}));

function summary(index: number, title: string) {
  return {
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title,
    author: `Author ${index}`,
    publicationYear: 2020 + index,
    rating: 4.2,
    coverSeed: `cover-${index}`,
    genres: [genres[index % genres.length]!],
  };
}

const ordinaryBook = summary(1, "Ordinary Catalogue Book");
const firstPick = summary(2, "First Personalised Pick");
const secondPick = summary(3, "Second Personalised Pick");
const unavailableBook = {
  availability: "UNAVAILABLE" as const,
  id: "30000000-0000-4000-8000-000000000001",
  title: "The Closed Archive",
  author: "Archive Author",
  coverSeed: "closed-archive",
};

const detailBook = {
  ...ordinaryBook,
  subtitle: null,
  synopsis: "A carefully written synopsis for the detail view.",
  isbn: "9781234567890",
  pageCount: 320,
  language: "English",
};

type ReadingStatus = "WANT_TO_READ" | "READING" | "FINISHED";

function availableEntry(book = ordinaryBook, status: ReadingStatus = "WANT_TO_READ") {
  return {
    status,
    book: { ...book, availability: "AVAILABLE" as const },
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

interface FetchScenario {
  activeGenres?: typeof genres;
  favourites?: typeof genres;
  personalised?: ReturnType<typeof summary>[];
  entries?: Array<ReturnType<typeof availableEntry> | {
    status: "WANT_TO_READ" | "READING" | "FINISHED";
    book: typeof unavailableBook;
  }>;
}

function engagementFetch(scenario: FetchScenario = {}) {
  const activeGenres = scenario.activeGenres ?? genres;
  let favourites = scenario.favourites ?? [];
  const personalised = scenario.personalised ?? [];
  const entries = scenario.entries ?? [];

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const method = init?.method ?? "GET";

    if (url.pathname === "/api/auth/me") return jsonResponse({ user });
    if (url.pathname === "/api/genres") return jsonResponse({ genres: activeGenres });

    if (url.pathname === "/api/me/favourite-genres" && method === "GET") {
      return jsonResponse({ genres: favourites });
    }
    if (url.pathname === "/api/me/favourite-genres" && method === "PUT") {
      const body = JSON.parse(String(init?.body)) as { genreIds: string[] };
      favourites = body.genreIds.map((genreId) => activeGenres.find((genre) => genre.id === genreId)!);
      return jsonResponse({ genres: favourites });
    }
    if (url.pathname === "/api/me/for-your-shelves") {
      return jsonResponse({ books: personalised });
    }
    if (url.pathname === "/api/me/reading-list" && method === "GET") {
      return jsonResponse({ entries });
    }

    const readingListMatch = url.pathname.match(/^\/api\/me\/reading-list\/([^/]+)$/);
    if (readingListMatch && method === "PUT") {
      const bookId = readingListMatch[1];
      const body = JSON.parse(String(init?.body)) as { status?: "WANT_TO_READ" | "READING" | "FINISHED" };
      const source = [ordinaryBook, firstPick, secondPick].find((book) => book.id === bookId) ?? ordinaryBook;
      return jsonResponse({ entry: availableEntry(source, body.status ?? "WANT_TO_READ") });
    }
    if (readingListMatch && method === "DELETE") {
      return new Response(null, { status: 204 });
    }

    if (url.pathname === `/api/books/${ordinaryBook.id}`) {
      return jsonResponse({ book: detailBook });
    }
    if (url.pathname === "/api/books") {
      const page = Number(url.searchParams.get("page") ?? 1);
      const pageSize = Number(url.searchParams.get("pageSize") ?? 24);
      return jsonResponse({
        books: [ordinaryBook],
        meta: { page, pageSize, totalItems: 1, totalPages: 1 },
      });
    }

    return jsonResponse({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("favourite genre preferences", () => {
  it("caps selection at five, supports explicit ordering, and saves ordered IDs", async () => {
    const fetchMock = engagementFetch({ favourites: genres.slice(0, 2) });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/preferences"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Favourite genres" })).toBeInTheDocument();
    await browser.click(await screen.findByRole("button", { name: "Move Mystery up" }));
    await browser.click(screen.getByRole("checkbox", { name: "Fantasy" }));
    await browser.click(screen.getByRole("checkbox", { name: "History" }));
    await browser.click(screen.getByRole("checkbox", { name: "Poetry" }));

    expect(screen.getByText("Maximum selected. Remove one genre to choose another.")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Travel" })).toBeDisabled();

    await browser.click(screen.getByRole("button", { name: "Save favourites" }));
    expect(await screen.findByText("Favourite genres saved.")).toBeInTheDocument();

    const saveCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === "/api/me/favourite-genres" && init?.method === "PUT",
    );
    expect(JSON.parse(String(saveCall?.[1]?.body))).toEqual({
      genreIds: [genres[1]!.id, genres[0]!.id, genres[2]!.id, genres[3]!.id, genres[4]!.id],
    });
    expect(saveCall?.[1]).toEqual(expect.objectContaining({ credentials: "include" }));
  });
});

describe("personalised catalogue", () => {
  it("omits the section and skips recommendations when favourites are empty", async () => {
    const fetchMock = engagementFetch({ favourites: [] });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/catalogue?q=Ordinary"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("link", { name: ordinaryBook.title })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/me/favourite-genres")).toBe(true);
    });
    expect(screen.queryByRole("heading", { name: "For your shelves" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/me/for-your-shelves")).toBe(false);
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/books?q=Ordinary")).toBe(true);
  });

  it("preserves personalised server order without changing ordinary results", async () => {
    const fetchMock = engagementFetch({
      favourites: [genres[0]!],
      personalised: [secondPick, firstPick],
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/catalogue"]}>
        <App />
      </MemoryRouter>,
    );

    const heading = await screen.findByRole("heading", { name: "For your shelves" });
    const section = heading.closest("section")!;
    expect(within(section).getAllByRole("heading", { level: 3 }).map((item) => item.textContent)).toEqual([
      secondPick.title,
      firstPick.title,
    ]);
    expect(await screen.findByText("Showing 1–1 of 1 books")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: ordinaryBook.title })).toBeInTheDocument();
  });
});

describe("My Shelf", () => {
  it("updates available books and allows archived shelf entries to be removed", async () => {
    const archivedEntry = { status: "READING" as const, book: unavailableBook };
    const fetchMock = engagementFetch({ entries: [availableEntry(), archivedEntry] });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/shelf"]}>
        <App />
      </MemoryRouter>,
    );

    const archivedItem = (await screen.findByRole("heading", { name: unavailableBook.title })).closest("li")!;
    expect(within(archivedItem).getByText("Archived / unavailable")).toBeInTheDocument();
    expect(within(archivedItem).getByLabelText(`Reading status for ${unavailableBook.title}`)).toBeDisabled();

    await browser.selectOptions(
      screen.getByLabelText(`Reading status for ${ordinaryBook.title}`),
      "READING",
    );
    expect(await screen.findByText(`${ordinaryBook.title} moved to Reading.`)).toBeInTheDocument();
    const updateCall = fetchMock.mock.calls.find(
      ([input, init]) => String(input) === `/api/me/reading-list/${ordinaryBook.id}` && init?.method === "PUT",
    );
    expect(JSON.parse(String(updateCall?.[1]?.body))).toEqual({ status: "READING" });

    await browser.click(within(archivedItem).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(screen.queryByText(unavailableBook.title)).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some(
      ([input, init]) => String(input) === `/api/me/reading-list/${unavailableBook.id}` && init?.method === "DELETE",
    )).toBe(true);
  });
});

describe("detail shelf controls", () => {
  it("adds, updates, and removes a book while preserving the catalogue return query", async () => {
    const fetchMock = engagementFetch({ entries: [] });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter initialEntries={[`/books/${ordinaryBook.id}?from=%3Fq%3DAtlas`]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: ordinaryBook.title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to catalogue/ })).toHaveAttribute("href", "/catalogue?q=Atlas");
    await browser.click(await screen.findByRole("button", { name: "Add to My Shelf" }));
    expect(await screen.findByText("Saved to My Shelf.")).toBeInTheDocument();

    await browser.selectOptions(screen.getByLabelText("Reading status"), "FINISHED");
    expect(await screen.findByText("Moved to Finished.")).toBeInTheDocument();
    await browser.click(screen.getByRole("button", { name: "Remove from My Shelf" }));
    expect(await screen.findByText("Removed from My Shelf.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to My Shelf" })).toBeInTheDocument();

    const mutationCalls = fetchMock.mock.calls.filter(
      ([input]) => String(input) === `/api/me/reading-list/${ordinaryBook.id}`,
    );
    expect(mutationCalls.map(([, init]) => [init?.method, init?.body])).toEqual([
      ["PUT", JSON.stringify({})],
      ["PUT", JSON.stringify({ status: "FINISHED" })],
      ["DELETE", undefined],
    ]);
  });
});
