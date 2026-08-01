import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const books = [
  {
    coverSeed: "public-atlas-seed",
    title: "The Unwritten Atlas",
    author: "Morgan Laurent",
    genres: ["Fantasy", "Adventure"],
  },
  {
    coverSeed: "public-orbit-seed",
    title: "A Small Orbit",
    author: "Nia Okafor",
    genres: ["Science Fiction"],
  },
  {
    coverSeed: "public-tide-seed",
    title: "The Library at Low Tide",
    author: "Elliot Vale",
    genres: ["Mystery"],
  },
  {
    coverSeed: "public-garden-seed",
    title: "Gardens for the Moonless",
    author: "Samira Bell",
    genres: ["Literary Fiction", "Fantasy"],
  },
  {
    coverSeed: "public-archive-seed",
    title: "The Quiet Archive",
    author: "Theo Marsh",
    genres: ["Historical Fiction"],
  },
  {
    coverSeed: "public-signal-seed",
    title: "Signal in the Margins",
    author: "June Park",
    genres: ["Science Fiction", "Mystery"],
  },
];

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("public landing page", () => {
  it("loads six unauthenticated previews without requiring a session", async () => {
    let resolveDiscovery!: (response: Response) => void;
    const fetchMock = vi.fn(
      (_input: RequestInfo | URL, _init?: RequestInit) => new Promise<Response>((resolve) => {
        resolveDiscovery = resolve;
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { container } = render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "A library, reshuffled." })).toBeInTheDocument();
    expect(container.querySelector(".public-wordmark [data-offset-index-mark]")).toBeInTheDocument();
    expect(screen.getByText("Amazon 2.0")).toBeInTheDocument();
    expect(screen.queryByText(/Community catalogue|Card 002/i)).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the public shelves…");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/discover",
      expect.objectContaining({
        headers: { Accept: "application/json" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetchMock.mock.calls[0]?.[1]).not.toHaveProperty("credentials");
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/auth/me")).toBe(false);

    act(() => resolveDiscovery(jsonResponse({ books })));

    const previewList = await screen.findByRole("list", { name: "Newest books" });
    expect(previewList.querySelectorAll(":scope > li")).toHaveLength(6);
    books.forEach((book) => {
      const preview = within(previewList).getByRole("listitem", { name: book.title });
      expect(within(preview).getByRole("heading", { name: book.title })).toBeInTheDocument();
      expect(preview).toHaveTextContent(`by ${book.author}`);
      book.genres.forEach((genre) => expect(preview).toHaveTextContent(genre));
      expect(preview).not.toHaveTextContent(book.coverSeed);
    });
    expect(previewList).not.toHaveTextContent("ISBN");
    expect(previewList).not.toHaveTextContent("synopsis");
    expect(screen.getByRole("link", { name: "Create a reader account" })).toHaveAttribute("href", "/sign-up");
    expect(screen.getByRole("link", { name: /^Sign in$/ })).toHaveAttribute("href", "/sign-in");
    expect(screen.queryByRole("group", { name: "Browse mode" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Load more books/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).startsWith("/api/books"))).toBe(false);
  });

  it("shows the exact independence statement and navigates to existing sign in", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/discover") return jsonResponse({ books });
      if (String(input) === "/api/auth/me") {
        return jsonResponse(
          { error: { code: "UNAUTHENTICATED", message: "Authentication is required." } },
          401,
        );
      }
      return jsonResponse({}, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(
        "Amazon 2.0 is an independent library platform and is not affiliated with Amazon.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("MEMBER ACCESS")).toBeInTheDocument();
    expect(
      screen.getByText("Sign in with your library card to browse, filter, and build your shelf."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/demo|seeded|Your card is waiting/i)).not.toBeInTheDocument();
    await browser.click(screen.getByRole("link", { name: "Sign in" }));

    expect(
      await screen.findByRole("heading", { name: "Sign in to the open stacks" }),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/auth/me")).toBe(true);
  });

  it("rejects a contract-invalid discovery response and retries", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          books: [
            ...books,
            {
              coverSeed: "seventh-seed",
              title: "A Seventh Book",
              author: "Contract Breaker",
              genres: ["Fantasy"],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ books }));
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    const error = await screen.findByRole("alert");
    expect(within(error).getByRole("heading", { name: "We couldn’t load the public shelves." })).toBeInTheDocument();
    await browser.click(within(error).getByRole("button", { name: "Try again" }));

    const previewList = await screen.findByRole("list", { name: "Newest books" });
    expect(previewList.querySelectorAll(":scope > li")).toHaveLength(6);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
