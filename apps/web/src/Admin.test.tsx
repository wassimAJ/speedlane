import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const librarian = {
  id: "00000000-0000-4000-8000-000000000002",
  email: "librarian@amazon2.local",
  displayName: "Morgan Librarian",
  role: "LIBRARIAN" as const,
};

const reader = {
  ...librarian,
  id: "00000000-0000-4000-8000-000000000001",
  email: "reader@amazon2.local",
  displayName: "Riley Reader",
  role: "READER" as const,
};

const genre = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Science Fiction",
  slug: "science-fiction",
  archivedAt: null,
};

const book = {
  id: "20000000-0000-4000-8000-000000000001",
  title: "The Unwritten Atlas",
  subtitle: null,
  author: "Morgan Laurent",
  synopsis: "A mapmaker discovers that an unfinished atlas changes the world around it.",
  isbn: "9780306406157",
  publicationYear: 2024,
  pageCount: 336,
  language: "English",
  rating: 4.7,
  coverSeed: "atlas-240",
  archivedAt: null,
  genres: [genre],
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function adminFetch(role: "LIBRARIAN" | "READER" = "LIBRARIAN") {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    const currentUser = role === "LIBRARIAN" ? librarian : reader;

    if (url.pathname === "/api/auth/me") return jsonResponse({ user: currentUser });
    if (url.pathname === "/api/admin/books" && init?.method === "POST") {
      const payload = JSON.parse(String(init.body));
      return jsonResponse({ book: { ...book, ...payload, genres: [genre] } }, 201);
    }
    if (url.pathname === "/api/admin/books") {
      return jsonResponse({ books: url.searchParams.get("status") === "archived" ? [book] : [book] });
    }
    if (url.pathname === "/api/admin/genres") {
      return jsonResponse({ genres: [genre] });
    }
    if (url.pathname === `/api/admin/books/${book.id}` && init?.method === "DELETE") {
      return jsonResponse({ book: { ...book, archivedAt: "2026-08-01T10:00:00.000Z" } });
    }
    if (url.pathname === `/api/admin/books/${book.id}/restore` && init?.method === "POST") {
      return jsonResponse({ book });
    }
    if (url.pathname === `/api/admin/genres/${genre.id}` && init?.method === "DELETE") {
      return jsonResponse({ genre: { ...genre, archivedAt: "2026-08-01T10:00:00.000Z" } });
    }

    return jsonResponse({ error: "Admin route not found." }, 404);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("librarian Back Room access", () => {
  it("shows librarian navigation but gives readers a clear in-shell forbidden route", async () => {
    const librarianFetch = adminFetch();
    vi.stubGlobal("fetch", librarianFetch);

    const librarianView = render(
      <MemoryRouter initialEntries={["/back-room/books"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Book records" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Back Room" }).length).toBeGreaterThan(0);
    const activeStatusNavigation = screen.getByRole("navigation", { name: "Book status" });
    expect(within(activeStatusNavigation).getByRole("link", { name: "Active" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(activeStatusNavigation).getByRole("link", { name: "Archived" })).not.toHaveAttribute(
      "aria-current",
    );
    await waitFor(() => {
      expect(librarianFetch).toHaveBeenCalledWith(
        "/api/admin/books?status=active",
        expect.objectContaining({ credentials: "include" }),
      );
    });
    librarianView.unmount();

    const readerFetch = adminFetch("READER");
    vi.stubGlobal("fetch", readerFetch);
    render(
      <MemoryRouter initialEntries={["/back-room/books"]}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "That room is for librarians." })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back Room" })).not.toBeInTheDocument();
    expect(readerFetch.mock.calls.some(([input]) => String(input).startsWith("/api/admin/"))).toBe(false);
  });
});

describe("book management", () => {
  it("strictly validates on the client, then sends the exact parsed create payload", async () => {
    const fetchMock = adminFetch();
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/back-room/books"]}>
        <App />
      </MemoryRouter>,
    );

    await browser.click(await screen.findByRole("button", { name: "Add book" }));
    const author = screen.getByLabelText("Author");
    const isbn = screen.getByLabelText("ISBN");
    const authorRow = author.closest(".admin-field-row--paired");
    expect(authorRow).not.toBeNull();
    expect(within(authorRow as HTMLElement).getByLabelText("ISBN")).toBe(isbn);
    expect(author).not.toHaveAttribute("aria-describedby");
    expect(author).not.toHaveAttribute("aria-invalid");
    expect(author.closest(".admin-field")?.querySelector(".admin-field__support")).toHaveClass(
      "admin-field__support--empty",
    );
    expect(isbn).toHaveAttribute("aria-describedby", "admin-book-isbn-hint");
    expect(isbn.closest(".admin-field")?.querySelector(".admin-field__support")).not.toHaveClass(
      "admin-field__support--empty",
    );
    expect(screen.getByLabelText("Publication year").closest(".admin-field-row--paired")).toContainElement(
      screen.getByLabelText("Page count"),
    );
    expect(screen.getByLabelText("Language").closest(".admin-field-row--paired")).toContainElement(
      screen.getByLabelText("Rating"),
    );
    expect(screen.getByLabelText("Title").closest(".admin-field-row")).not.toHaveClass(
      "admin-field-row--paired",
    );
    await browser.type(screen.getByLabelText("Title"), "  The Long Index  ");
    await browser.type(author, "Avery North");
    await browser.type(screen.getByLabelText("Synopsis"), "A catalogue mystery.");
    await browser.type(isbn, "9780306406158");
    await browser.type(screen.getByLabelText("Publication year"), "2025");
    await browser.type(screen.getByLabelText("Page count"), "280");
    await browser.type(screen.getByLabelText("Language"), "English");
    await browser.type(screen.getByLabelText("Rating"), "4.2");
    await browser.type(screen.getByLabelText("Cover seed"), "long-index");
    await browser.click(screen.getByRole("button", { name: "Create book" }));

    expect((await screen.findAllByText("ISBN checksum is invalid.")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Choose at least one active genre.").length).toBeGreaterThan(0);
    const errorSummary = screen.getByRole("alert", {
      name: "Correct the highlighted fields before saving.",
    });
    expect(errorSummary).toHaveFocus();
    expect(isbn).toHaveAttribute(
      "aria-describedby",
      "admin-book-isbn-hint admin-book-isbn-error",
    );
    expect(isbn).toHaveAttribute("aria-invalid", "true");
    const isbnFieldError = document.getElementById("admin-book-isbn-error");
    expect(isbnFieldError).toHaveTextContent("Error: ISBN checksum is invalid.");
    const visibleErrorPrefix = isbnFieldError?.querySelector(".form-error__prefix");
    expect(visibleErrorPrefix).toBeInTheDocument();
    expect(visibleErrorPrefix).not.toHaveClass("visually-hidden");
    expect(
      Array.from(
        isbn.closest(".admin-field")?.querySelector(".admin-field__support")?.children ?? [],
      ).map((element) => element.id),
    ).toEqual(["admin-book-isbn-hint", "admin-book-isbn-error"]);
    expect(screen.getByRole("group", { name: /Genres/ })).toHaveAttribute(
      "aria-describedby",
      "admin-book-genres-error",
    );
    await browser.click(within(errorSummary).getByRole("link", { name: "ISBN: ISBN checksum is invalid." }));
    expect(screen.getByLabelText("ISBN")).toHaveFocus();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input) === "/api/admin/books" && init?.method === "POST")).toBe(false);

    await browser.clear(screen.getByLabelText("ISBN"));
    await browser.type(screen.getByLabelText("ISBN"), "978-0-306-40615-7");
    await browser.click(screen.getByRole("checkbox", { name: "Science Fiction" }));
    await browser.click(screen.getByRole("button", { name: "Create book" }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input, init]) => {
        if (String(input) !== "/api/admin/books" || init?.method !== "POST") return false;
        expect(init.credentials).toBe("include");
        expect(JSON.parse(String(init.body))).toEqual({
          title: "The Long Index",
          subtitle: null,
          author: "Avery North",
          synopsis: "A catalogue mystery.",
          isbn: "9780306406157",
          publicationYear: 2025,
          pageCount: 280,
          language: "English",
          rating: 4.2,
          coverSeed: "long-index",
          genreIds: [genre.id],
        });
        return true;
      })).toBe(true);
    });
  });

  it("names archive confirmations as reversible and sends restore requests", async () => {
    const fetchMock = adminFetch();
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    const view = render(
      <MemoryRouter initialEntries={["/back-room/books"]}>
        <App />
      </MemoryRouter>,
    );

    const archiveTrigger = await screen.findByRole("button", { name: `Archive ${book.title}` });
    await browser.click(archiveTrigger);
    const dialog = screen.getByRole("dialog", { name: `Archive “${book.title}”?` });
    expect(within(dialog).getByText(/This action is reversible/)).toBeInTheDocument();
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const archive = within(dialog).getByRole("button", { name: "Archive" });
    expect(cancel).toHaveFocus();
    expect(archive).toHaveClass("button--destructive");
    await browser.tab({ shift: true });
    expect(archive).toHaveFocus();
    await browser.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(archiveTrigger).toHaveFocus();

    await browser.click(archiveTrigger);
    await browser.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/books/${book.id}`,
        expect.objectContaining({ method: "DELETE", credentials: "include" }),
      );
    });
    view.unmount();

    render(
      <MemoryRouter initialEntries={["/back-room/books?status=archived"]}>
        <App />
      </MemoryRouter>,
    );
    const archivedStatusNavigation = await screen.findByRole("navigation", { name: "Book status" });
    expect(within(archivedStatusNavigation).getByRole("link", { name: "Archived" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(archivedStatusNavigation).getByRole("link", { name: "Active" })).not.toHaveAttribute(
      "aria-current",
    );
    await browser.click(await screen.findByRole("button", { name: `Restore ${book.title}` }));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/admin/books/${book.id}/restore`,
        expect.objectContaining({ method: "POST", credentials: "include" }),
      );
    });
  });

  it("expires the session when a restore mutation returns 401", async () => {
    const baseFetch = adminFetch();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === `/api/admin/books/${book.id}/restore` && init?.method === "POST") {
        return jsonResponse({ error: "Authentication is required." }, 401);
      }
      return baseFetch(input, init);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/back-room/books?status=archived"]}>
        <App />
      </MemoryRouter>,
    );

    await browser.click(await screen.findByRole("button", { name: `Restore ${book.title}` }));
    expect(await screen.findByRole("heading", { name: "Sign in to the open stacks" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your library card expired. Sign in again to continue.",
    );
  });
});

describe("genre management", () => {
  it("associates genre errors and summary links with their controls", async () => {
    const fetchMock = adminFetch();
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/back-room/genres"]}>
        <App />
      </MemoryRouter>,
    );

    await browser.click(await screen.findByRole("button", { name: "Add genre" }));
    const name = screen.getByLabelText("Name");
    const slug = screen.getByLabelText("Slug");
    const pair = name.closest(".admin-field-row--paired");
    expect(pair).not.toBeNull();
    expect(within(pair as HTMLElement).getByLabelText("Slug")).toBe(slug);
    expect(name).not.toHaveAttribute("aria-describedby");
    expect(slug).toHaveAttribute("aria-describedby", "admin-genre-slug-hint");
    await browser.type(screen.getByLabelText("Slug"), "BAD SLUG");
    await browser.click(screen.getByRole("button", { name: "Create genre" }));

    const summary = screen.getByRole("alert", {
      name: "Correct the highlighted fields before saving.",
    });
    expect(summary).toHaveFocus();
    expect(name).toHaveAttribute(
      "aria-describedby",
      "admin-genre-name-error",
    );
    expect(slug).toHaveAttribute(
      "aria-describedby",
      "admin-genre-slug-hint admin-genre-slug-error",
    );
    expect(slug).toHaveAttribute("aria-invalid", "true");
    await browser.click(within(summary).getByRole("link", { name: /Slug:/ }));
    expect(screen.getByLabelText("Slug")).toHaveFocus();
    expect(fetchMock.mock.calls.some(([input, init]) => String(input) === "/api/admin/genres" && init?.method === "POST")).toBe(false);
  });

  it("shows the sole-active-genre conflict and retains an open edit form", async () => {
    const fetchMock = adminFetch();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname === "/api/auth/me") return jsonResponse({ user: librarian });
      if (url.pathname === "/api/admin/genres") return jsonResponse({ genres: [genre] });
      if (url.pathname === `/api/admin/genres/${genre.id}` && init?.method === "DELETE") {
        return jsonResponse({ error: "Genre is the only active genre for one or more active books." }, 409);
      }
      return jsonResponse({ error: "Admin route not found." }, 404);
    });
    vi.stubGlobal("fetch", fetchMock);
    const browser = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/back-room/genres"]}>
        <App />
      </MemoryRouter>,
    );

    await browser.click(await screen.findByRole("button", { name: `Edit ${genre.name}` }));
    const nameInput = screen.getByLabelText("Name");
    await browser.clear(nameInput);
    await browser.type(nameInput, "Speculative Fiction");
    await browser.click(screen.getByRole("button", { name: `Archive ${genre.name}` }));
    await browser.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Archive" }));

    expect(await screen.findByRole("alert", { name: "" })).toHaveTextContent(
      "Genre is the only active genre for one or more active books.",
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Speculative Fiction");
  });
});
