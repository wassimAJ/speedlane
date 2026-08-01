import { render, screen, waitFor } from "@testing-library/react";
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

const genre = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Science Fiction",
  slug: "science-fiction",
};

const book = {
  id: "20000000-0000-4000-8000-000000000001",
  title: "The Unwritten Atlas",
  author: "Morgan Laurent",
  publicationYear: 2024,
  rating: 4.7,
  coverSeed: "atlas-240",
  genres: [genre],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function catalogueResponse(url: URL) {
  const page = Number(url.searchParams.get("page") ?? 1);
  const pageSize = Number(url.searchParams.get("pageSize") ?? 24);
  return {
    books: [book],
    meta: { page, pageSize, totalItems: 1, totalPages: 1 },
  };
}

function authenticatedFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");

    if (url.pathname === "/api/auth/me") return jsonResponse({ user });
    if (url.pathname === "/api/auth/login") return jsonResponse({ user });
    if (url.pathname === "/api/genres") return jsonResponse({ genres: [genre] });
    if (url.pathname === "/api/books") return jsonResponse(catalogueResponse(url));
    if (url.pathname === `/api/books/${book.id}`) return jsonResponse({ book });
    if (url.pathname === "/api/auth/logout" && init?.method === "POST") {
      return new Response(null, { status: 204 });
    }

    return jsonResponse({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("authenticated routing", () => {
  it("sends an unauthenticated visitor from the catalogue to sign in", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/catalogue"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Sign in to the open stacks" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/me",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(screen.queryByRole("heading", { name: "Find your next book" })).not.toBeInTheDocument();
  });

  it("signs in with the cookie API and opens the protected catalogue", async () => {
    const fetchMock = authenticatedFetch();
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse(
        { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } },
        401,
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/catalogue?q=Atlas"]}>
        <App />
      </MemoryRouter>,
    );

    await browser.type(await screen.findByLabelText("Email address"), "reader@amazon2.local");
    await browser.type(screen.getByLabelText("Password"), "ReaderDemo123!");
    await browser.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Find your next book" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "The Unwritten Atlas" })).toBeInTheDocument();

    const loginCall = fetchMock.mock.calls.find(([input]) => String(input) === "/api/auth/login");
    expect(loginCall?.[1]).toEqual(
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ email: "reader@amazon2.local", password: "ReaderDemo123!" }),
      }),
    );
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/books?q=Atlas")).toBe(true);
  });
});

describe("URL-driven catalogue", () => {
  it("hydrates controls from the URL and resets page when search and filters are applied", async () => {
    const fetchMock = authenticatedFetch();
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter
        initialEntries={[
          "/catalogue?q=Atlas&genre=science-fiction&yearFrom=1980&yearTo=2025&sort=rating&page=3&pageSize=12",
        ]}
      >
        <App />
      </MemoryRouter>,
    );

    const search = await screen.findByLabelText("Search by title or author");
    await screen.findByRole("link", { name: "The Unwritten Atlas" });
    expect(search).toHaveValue("Atlas");
    expect(screen.getByLabelText("Sort by")).toHaveValue("rating");
    expect(screen.getByLabelText("Books per page")).toHaveValue("12");
    expect(fetchMock.mock.calls.some(([input]) =>
      String(input) === "/api/books?q=Atlas&genre=science-fiction&yearFrom=1980&yearTo=2025&sort=rating&page=3&pageSize=12"
    )).toBe(true);

    await browser.clear(search);
    await browser.type(search, "Dune");
    await browser.click(screen.getByRole("button", { name: "Search" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) =>
        String(input) === "/api/books?q=Dune&genre=science-fiction&yearFrom=1980&yearTo=2025&sort=rating&pageSize=12"
      )).toBe(true);
    });

    await browser.click(screen.getByRole("button", { name: "Filters (3)" }));
    expect(screen.getByLabelText("Genre")).toHaveValue("science-fiction");
    expect(screen.getByLabelText("From year")).toHaveValue("1980");
    expect(screen.getByLabelText("To year")).toHaveValue("2025");
    const bookRequestsBeforeInvalidRange = fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/books"),
    ).length;
    await browser.clear(screen.getByLabelText("From year"));
    await browser.type(screen.getByLabelText("From year"), "2026");
    await browser.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(await screen.findByText(/from.*year must be earlier/i)).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) =>
      String(input).startsWith("/api/books"),
    )).toHaveLength(bookRequestsBeforeInvalidRange);

    await browser.clear(screen.getByLabelText("From year"));
    await browser.type(screen.getByLabelText("From year"), "2000");
    await browser.click(screen.getByRole("button", { name: "Apply filters" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) =>
        String(input) === "/api/books?q=Dune&genre=science-fiction&yearFrom=2000&yearTo=2025&sort=rating&pageSize=12"
      )).toBe(true);
    });
  });

  it("normalizes malformed query options before requesting books", async () => {
    const fetchMock = authenticatedFetch();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter initialEntries={["/catalogue?sort=sideways&internal=true"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Some catalogue options were reset.")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/books")).toBe(true);
    });
    expect(screen.getByLabelText("Sort by")).toHaveValue("newest");
  });
});
