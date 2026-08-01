import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  useLocation,
  useNavigate,
  useNavigationType,
} from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

const reader = {
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

function book(number: number) {
  return {
    id: `20000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    title: `Catalogue Book ${number}`,
    author: `Author ${number}`,
    publicationYear: 2020 + number,
    rating: 4.1,
    coverSeed: `catalogue-${number}`,
    genres: [genre],
  };
}

function detailFor(summary: ReturnType<typeof book>) {
  return {
    ...summary,
    subtitle: null,
    synopsis: `Synopsis for ${summary.title}.`,
    isbn: "9780306406157",
    pageCount: 240,
    language: "English",
  };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pageResponse(
  page: number,
  books: ReturnType<typeof book>[],
  totalPages: number,
  totalItems: number,
  pageSize = 24,
) {
  return jsonResponse({
    books,
    meta: { page, pageSize, totalItems, totalPages },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function catalogueFetch(
  booksHandler: (url: URL, init?: RequestInit) => Response | Promise<Response>,
  detailHandler?: (url: URL, init?: RequestInit) => Response | Promise<Response>,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    if (url.pathname === "/api/auth/me") return jsonResponse({ user: reader });
    if (url.pathname === "/api/genres") return jsonResponse({ genres: [genre] });
    if (url.pathname === "/api/me/favourite-genres") return jsonResponse({ genres: [] });
    if (url.pathname === "/api/me/reading-list") return jsonResponse({ entries: [] });
    if (url.pathname === "/api/books") return booksHandler(url, init);
    if (url.pathname.startsWith("/api/books/") && detailHandler) return detailHandler(url, init);
    return jsonResponse({ error: { code: "NOT_FOUND", message: "Route not found." } }, 404);
  });
}

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="Current catalogue URL">{`${location.pathname}${location.search}`}</output>;
}

function renderCatalogue(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
      <LocationProbe />
    </MemoryRouter>,
  );
}

function HistoryProbe() {
  const navigate = useNavigate();
  const navigationType = useNavigationType();

  return (
    <div>
      <output aria-label="Navigation type">{navigationType}</output>
      <button onClick={() => navigate(-1)} type="button">History back</button>
      <button onClick={() => navigate(1)} type="button">History forward</button>
    </div>
  );
}

function renderCatalogueWithHistory(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
      <LocationProbe />
      <HistoryProbe />
    </MemoryRouter>,
  );
}

function continuousAnnouncement() {
  const announcements = document.querySelectorAll<HTMLElement>(
    '[aria-live="polite"][aria-atomic="true"]',
  );
  expect(announcements).toHaveLength(1);
  return announcements.item(0);
}

function continuousVisibleStatus() {
  const status = document.querySelector<HTMLElement>(".continuous-status p");
  expect(status).not.toBeNull();
  return status as HTMLElement;
}

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  readonly callback: IntersectionObserverCallback;
  readonly root = null;
  readonly rootMargin: string;
  readonly thresholds = [0];
  target: Element | null = null;

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.rootMargin = options?.rootMargin ?? "0px";
    MockIntersectionObserver.instances.push(this);
  }

  disconnect() {
    this.target = null;
  }

  observe(target: Element) {
    this.target = target;
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(target: Element) {
    if (this.target === target) this.target = null;
  }

  trigger(isIntersecting = true) {
    if (!this.target) return;
    this.callback(
      [{ isIntersecting, target: this.target } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

type ContinuousResetKind = "search" | "filters" | "pageSize";

async function verifyContinuousQueryReset(kind: ContinuousResetKind) {
  const numberBase = kind === "search" ? 70 : kind === "filters" ? 80 : 90;
  const initialFirst = book(numberBase + 1);
  const initialSecond = book(numberBase + 2);
  const replacement = book(numberBase + 3);
  const baseQuery = `reset-${kind}`;
  const changedRequest = kind === "search"
    ? "/api/books?q=Fresh+Search"
    : kind === "filters"
      ? `/api/books?q=${baseQuery}&genre=science-fiction&yearFrom=1990&yearTo=2024`
      : `/api/books?q=${baseQuery}&pageSize=48`;
  const changedLocation = `${changedRequest.replace("/api/books", "/catalogue")}&browse=continuous`;

  const fetchMock = catalogueFetch((url) => {
    if (`${url.pathname}${url.search}` === changedRequest) {
      return pageResponse(1, [replacement], 3, 3, kind === "pageSize" ? 48 : 24);
    }

    const page = Number(url.searchParams.get("page") ?? 1);
    return pageResponse(page, [page === 1 ? initialFirst : initialSecond], 3, 3);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IntersectionObserver", undefined);
  const browser = userEvent.setup();

  renderCatalogue(`/catalogue?q=${baseQuery}&browse=continuous`);
  await browser.click(await screen.findByRole("button", { name: "Load more books" }));
  await screen.findByRole("link", { name: initialSecond.title });
  await waitFor(() => {
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      `/catalogue?q=${baseQuery}&page=2&browse=continuous`,
    );
  });

  if (kind === "search") {
    const search = screen.getByLabelText("Search by title or author");
    await waitFor(() => expect(search).toHaveValue(baseQuery));
    await browser.clear(search);
    await browser.type(search, "Fresh Search");
    await browser.click(screen.getByRole("button", { name: "Search" }));
  } else if (kind === "filters") {
    await browser.click(screen.getByRole("button", { name: "Filters" }));
    await browser.selectOptions(await screen.findByLabelText("Genre"), "science-fiction");
    await browser.type(screen.getByLabelText("From year"), "1990");
    await browser.type(screen.getByLabelText("To year"), "2024");
    await browser.click(screen.getByRole("button", { name: "Apply filters" }));
  } else {
    await browser.selectOptions(screen.getByLabelText("Books per load"), "48");
  }

  await screen.findByRole("link", { name: replacement.title });
  expect(screen.getByRole("radio", { name: "Continuous" })).toBeChecked();
  await waitFor(() => {
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(changedLocation);
  });
  expect(screen.queryByRole("link", { name: initialFirst.title })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: initialSecond.title })).not.toBeInTheDocument();

  const bookRequests = fetchMock.mock.calls
    .map(([input]) => String(input))
    .filter((url) => url.startsWith("/api/books"));
  expect(bookRequests.at(-1)).toBe(changedRequest);
  expect(bookRequests.every((url) => !url.includes("browse=") && !url.includes("page=1"))).toBe(true);
}

afterEach(() => {
  MockIntersectionObserver.instances = [];
  vi.unstubAllGlobals();
});

describe("catalogue browse mode and canonical URL state", () => {
  it("keeps Pages as the default and normalizes invalid browse state without sending it to the API", async () => {
    const fetchMock = catalogueFetch((url) =>
      pageResponse(Number(url.searchParams.get("page") ?? 1), [book(1)], 2, 25),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderCatalogue("/catalogue?q=browse-invalid&browse=sideways&page=2");

    const browseMode = await screen.findByRole("group", { name: "Browse mode" });
    await screen.findByRole("link", { name: "Catalogue Book 1" });
    expect(within(browseMode).getByRole("radio", { name: "Pages" })).toBeChecked();
    expect(within(browseMode).getByRole("radio", { name: "Continuous" })).not.toBeChecked();
    expect(screen.getByRole("navigation", { name: "Catalogue pages" })).toBeInTheDocument();
    expect(screen.getByLabelText("Books per page")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Load more books/i })).not.toBeInTheDocument();
    expect(screen.getByText("Some catalogue options were reset.")).toHaveAttribute("role", "status");
    await waitFor(() => {
      expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
        "/catalogue?q=browse-invalid&page=2",
      );
    });
    expect(fetchMock.mock.calls.some(([input]) => String(input) === "/api/books?q=browse-invalid&page=2")).toBe(true);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("browse="))).toBe(false);
  });

  it("switches modes with one canonical entry, preserves filters, and Reset all restores defaults", async () => {
    const fetchMock = catalogueFetch((url) =>
      pageResponse(Number(url.searchParams.get("page") ?? 1), [book(2)], 4, 40, 12),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", undefined);
    const browser = userEvent.setup();

    renderCatalogue(
      "/catalogue?q=mode-state&genre=science-fiction&yearFrom=1980&yearTo=2025&sort=rating&page=3&pageSize=12",
    );

    await screen.findByRole("link", { name: "Catalogue Book 2" });
    const continuous = screen.getByRole("radio", { name: "Continuous" });
    await browser.click(continuous);

    expect(continuous).toHaveFocus();
    expect(continuous).toBeChecked();
    expect(screen.getByLabelText("Books per load")).toHaveValue("12");
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      "/catalogue?q=mode-state&genre=science-fiction&yearFrom=1980&yearTo=2025&sort=rating&pageSize=12&browse=continuous",
    );
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([input]) =>
        String(input) === "/api/books?q=mode-state&genre=science-fiction&yearFrom=1980&yearTo=2025&sort=rating&pageSize=12"
      )).toBe(true);
    });
    await waitFor(() => {
      expect(continuousAnnouncement()).toHaveTextContent(
        /^Continuous browsing selected\. 1 of 40 books loaded\.$/,
      );
    });
    expect(continuousVisibleStatus()).toHaveTextContent(/^1 of 40 books loaded$/);
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("browse="))).toBe(false);

    await browser.click(screen.getByRole("radio", { name: "Pages" }));
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      "/catalogue?q=mode-state&genre=science-fiction&yearFrom=1980&yearTo=2025&sort=rating&pageSize=12",
    );

    await browser.click(screen.getByRole("radio", { name: "Continuous" }));
    await browser.click(screen.getByRole("button", { name: "Filters (3)" }));
    await browser.click(screen.getByRole("button", { name: "Reset all" }));
    expect(screen.getByRole("radio", { name: "Pages" })).toBeChecked();
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent("/catalogue");
  });

  it.each([
    { kind: "search", label: "search" },
    { kind: "filters", label: "applied genre/year filters" },
    { kind: "pageSize", label: "page size" },
  ] as const)("resets appended results for a $label change while preserving Continuous", async ({ kind }) => {
    await verifyContinuousQueryReset(kind);
  });
});

describe("continuous catalogue loading", () => {
  it("degrades to manual loading, keeps requests contiguous, deduplicates triggers and IDs, focuses additions, and stops at the end", async () => {
    const secondPage = deferred<Response>();
    const first = book(11);
    const duplicate = book(12);
    const third = book(13);
    const fourth = book(14);
    const fetchMock = catalogueFetch((url) => {
      const page = Number(url.searchParams.get("page") ?? 1);
      if (page === 1) return pageResponse(1, [first, duplicate], 3, 4, 12);
      if (page === 2) return secondPage.promise;
      return pageResponse(3, [fourth], 3, 4, 12);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", undefined);

    renderCatalogue("/catalogue?q=manual-depth&pageSize=12&browse=continuous");

    const initialLoadButton = await screen.findByRole("button", { name: "Load more books" });
    expect(continuousVisibleStatus()).toHaveTextContent(/^2 of 4 books loaded$/);
    expect(continuousAnnouncement()).toHaveTextContent(
      /^Continuous browsing selected\. 2 of 4 books loaded\.$/,
    );
    expect(screen.getByRole("region", { name: "Catalogue results" })).not.toHaveAttribute("aria-busy");
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);

    act(() => {
      fireEvent.click(initialLoadButton);
      fireEvent.click(initialLoadButton);
    });
    expect(screen.getByRole("button", { name: "Loading more books…" })).toBe(initialLoadButton);
    expect(initialLoadButton).toBeDisabled();
    expect(screen.getByRole("region", { name: "Catalogue results" })).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);
    expect(continuousVisibleStatus()).toHaveTextContent(/^Loading more books…$/);
    expect(continuousAnnouncement()).toHaveTextContent(/^Loading more books…$/);
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("page=2"))).toHaveLength(1);

    await act(async () => {
      secondPage.resolve(pageResponse(2, [duplicate, third], 3, 4, 12));
      await secondPage.promise;
    });

    await waitFor(() => expect(screen.getByRole("link", { name: third.title })).toHaveFocus());
    expect(screen.getAllByRole("listitem").filter((item) => item.classList.contains("book-card"))).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: duplicate.title })).toHaveLength(1);
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      "/catalogue?q=manual-depth&page=2&pageSize=12&browse=continuous",
    );
    expect(continuousAnnouncement()).toHaveTextContent(
      /^Loaded 1 more books\. 3 of 4 shown\.$/,
    );
    expect(continuousVisibleStatus()).toHaveTextContent(/^3 of 4 books loaded$/);
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: "Load more books" }));
    await waitFor(() => expect(screen.getByRole("link", { name: fourth.title })).toHaveFocus());
    expect(continuousVisibleStatus()).toHaveTextContent(
      /^You’ve reached the end of the catalogue\. 4 books shown\.$/,
    );
    expect(continuousAnnouncement()).toHaveTextContent(
      /^You’ve reached the end of the catalogue\. 4 books shown\.$/,
    );
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Load more books/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("page=3"))).toHaveLength(1);
  });

  it("uses one near-end observer request, preserves focus for automatic loading, and pauses while focus is in the result zone", async () => {
    const secondPage = deferred<Response>();
    const fetchMock = catalogueFetch((url) => {
      const page = Number(url.searchParams.get("page") ?? 1);
      if (page === 1) return pageResponse(1, [book(21)], 3, 3);
      if (page === 2) return secondPage.promise;
      return pageResponse(3, [book(23)], 3, 3);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    renderCatalogue("/catalogue?q=observer-flow&browse=continuous");

    const continuous = await screen.findByRole("radio", { name: "Continuous" });
    continuous.focus();
    await waitFor(() => expect(MockIntersectionObserver.instances.length).toBeGreaterThan(0));
    const observer = MockIntersectionObserver.instances.at(-1);
    expect(observer?.rootMargin).toBe("0px 0px 75% 0px");
    act(() => {
      observer?.trigger();
      observer?.trigger();
    });
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("page=2"))).toHaveLength(1);

    await act(async () => {
      secondPage.resolve(pageResponse(2, [book(22)], 3, 3));
      await secondPage.promise;
    });
    await screen.findByRole("link", { name: "Catalogue Book 22" });
    expect(continuous).toHaveFocus();

    const protectedTitle = screen.getByRole("link", { name: "Catalogue Book 22" });
    protectedTitle.focus();
    act(() => MockIntersectionObserver.instances.at(-1)?.trigger());
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("page=3"))).toHaveLength(0);

    screen.getByLabelText("Sort by").focus();
    act(() => MockIntersectionObserver.instances.at(-1)?.trigger());
    await waitFor(() => {
      expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("page=3"))).toHaveLength(1);
    });
    expect(screen.getByLabelText("Sort by")).toHaveFocus();
  });

  it("retains loaded books on append failure, retries the failed page, and ignores stale work after a sort reset", async () => {
    const retryPage = deferred<Response>();
    const stalePage = deferred<Response>();
    let pageTwoAttempts = 0;
    const fetchMock = catalogueFetch((url) => {
      const page = Number(url.searchParams.get("page") ?? 1);
      if (url.searchParams.get("sort") === "title") {
        return pageResponse(1, [book(34)], 1, 1);
      }
      if (page === 1) return pageResponse(1, [book(31)], 3, 3);
      if (page === 2) {
        pageTwoAttempts += 1;
        return pageTwoAttempts === 1
          ? jsonResponse({ error: { code: "INTERNAL_ERROR", message: "Temporary failure." } }, 500)
          : retryPage.promise;
      }
      return stalePage.promise;
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", undefined);
    const browser = userEvent.setup();

    renderCatalogue("/catalogue?q=retry-stale&browse=continuous");
    await browser.click(await screen.findByRole("button", { name: "Load more books" }));

    expect(await screen.findByText("We couldn’t load more books.")).toBeInTheDocument();
    expect(continuousVisibleStatus()).toHaveTextContent(/^We couldn’t load more books\.$/);
    expect(screen.getByRole("link", { name: "Catalogue Book 31" })).toBeInTheDocument();
    expect(continuousAnnouncement()).toHaveTextContent(
      /^More books could not be loaded\.$/,
    );
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);
    const retry = screen.getByRole("button", { name: "Try loading more" });
    await browser.click(retry);
    expect(screen.getByRole("button", { name: "Loading more books…" })).toBe(retry);
    expect(continuousVisibleStatus()).toHaveTextContent(/^Loading more books…$/);
    expect(continuousAnnouncement()).toHaveTextContent(/^Trying to load more books\.$/);
    expect(screen.getByRole("region", { name: "Catalogue results" })).toHaveAttribute("aria-busy", "true");
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(1);

    await act(async () => {
      retryPage.resolve(pageResponse(2, [book(32)], 3, 3));
      await retryPage.promise;
    });
    await waitFor(() => expect(screen.getByRole("link", { name: "Catalogue Book 32" })).toHaveFocus());
    expect(continuousAnnouncement()).toHaveTextContent(
      /^Loaded 1 more books\. 2 of 3 shown\.$/,
    );
    expect(continuousVisibleStatus()).toHaveTextContent(/^2 of 3 books loaded$/);
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);

    await browser.click(screen.getByRole("button", { name: "Load more books" }));
    expect(fetchMock.mock.calls.filter(([input]) => String(input).includes("page=3"))).toHaveLength(1);
    await browser.selectOptions(screen.getByLabelText("Sort by"), "title");
    expect(screen.getByRole("radio", { name: "Continuous" })).toBeChecked();
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      "/catalogue?q=retry-stale&sort=title&browse=continuous",
    );
    expect(await screen.findByRole("link", { name: "Catalogue Book 34" })).toBeInTheDocument();

    await act(async () => {
      stalePage.resolve(pageResponse(3, [book(33)], 3, 3));
      await stalePage.promise;
    });
    expect(screen.queryByRole("link", { name: "Catalogue Book 33" })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("browse="))).toBe(false);
  });

  it("restores a cold loaded depth contiguously and reuses cached pages and the selected-book anchor after detail", async () => {
    const secondPage = deferred<Response>();
    const requestedPages: number[] = [];
    const summaries = [book(41), book(42), book(43)];
    const fetchMock = catalogueFetch(
      (url) => {
        const page = Number(url.searchParams.get("page") ?? 1);
        requestedPages.push(page);
        if (page === 2) return secondPage.promise;
        return pageResponse(page, [summaries[page - 1] as ReturnType<typeof book>], 3, 3);
      },
      (url) => {
        const summary = summaries.find((candidate) => url.pathname.endsWith(candidate.id));
        return summary ? jsonResponse({ book: detailFor(summary) }) : jsonResponse({}, 404);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", undefined);
    const browser = userEvent.setup();

    renderCatalogue("/catalogue?q=cold-restore&page=3&browse=continuous");

    expect((await screen.findAllByText("Restoring your place in the catalogue…")).length).toBeGreaterThan(0);
    await waitFor(() => expect(requestedPages).toEqual([1, 2]));
    await act(async () => {
      secondPage.resolve(pageResponse(2, [summaries[1] as ReturnType<typeof book>], 3, 3));
      await secondPage.promise;
    });

    const thirdTitle = await screen.findByRole("link", { name: summaries[2]?.title });
    expect(requestedPages).toEqual([1, 2, 3]);
    expect(thirdTitle).toHaveAttribute(
      "href",
      `/books/${summaries[2]?.id}?from=${encodeURIComponent("?q=cold-restore&page=3&browse=continuous")}`,
    );
    await browser.click(thirdTitle);
    expect(await screen.findByRole("heading", { name: summaries[2]?.title })).toBeInTheDocument();
    await browser.click(screen.getByRole("link", { name: /Back to catalogue/ }));

    const restoredTitle = await screen.findByRole("link", { name: summaries[2]?.title });
    await waitFor(() => expect(restoredTitle).toHaveFocus());
    expect(requestedPages).toEqual([1, 2, 3]);
    expect(screen.getByRole("radio", { name: "Continuous" })).toBeChecked();
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      "/catalogue?q=cold-restore&page=3&browse=continuous",
    );
  });
});

describe("continuous catalogue history", () => {
  it("pushes a mode choice, replaces append depth, and restores one continuous history entry", async () => {
    const fetchMock = catalogueFetch((url) => {
      const page = Number(url.searchParams.get("page") ?? 1);
      return pageResponse(page, [book(100 + page)], 3, 3);
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("IntersectionObserver", undefined);
    const browser = userEvent.setup();

    renderCatalogueWithHistory("/catalogue?q=history-semantics");

    await screen.findByRole("link", { name: "Catalogue Book 101" });
    expect(screen.getByLabelText("Navigation type")).toHaveTextContent("POP");

    await browser.click(screen.getByRole("radio", { name: "Continuous" }));
    await screen.findByRole("button", { name: "Load more books" });
    expect(screen.getByLabelText("Navigation type")).toHaveTextContent("PUSH");
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      "/catalogue?q=history-semantics&browse=continuous",
    );

    await browser.click(screen.getByRole("button", { name: "Load more books" }));
    await screen.findByRole("link", { name: "Catalogue Book 102" });
    await waitFor(() => {
      expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
        "/catalogue?q=history-semantics&page=2&browse=continuous",
      );
    });
    expect(screen.getByLabelText("Navigation type")).toHaveTextContent("REPLACE");

    await browser.click(screen.getByRole("button", { name: "Load more books" }));
    await screen.findByRole("link", { name: "Catalogue Book 103" });
    await waitFor(() => {
      expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
        "/catalogue?q=history-semantics&page=3&browse=continuous",
      );
    });
    expect(screen.getByLabelText("Navigation type")).toHaveTextContent("REPLACE");

    await browser.click(screen.getByRole("button", { name: "History back" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Pages" })).toBeChecked());
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      "/catalogue?q=history-semantics",
    );
    expect(screen.getByLabelText("Navigation type")).toHaveTextContent("POP");
    await screen.findByRole("link", { name: "Catalogue Book 101" });
    const requestsBeforeForward = fetchMock.mock.calls.length;

    await browser.click(screen.getByRole("button", { name: "History forward" }));
    await waitFor(() => expect(screen.getByRole("radio", { name: "Continuous" })).toBeChecked());
    expect(await screen.findByRole("link", { name: "Catalogue Book 103" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current catalogue URL")).toHaveTextContent(
      "/catalogue?q=history-semantics&page=3&browse=continuous",
    );
    expect(screen.getByLabelText("Navigation type")).toHaveTextContent("POP");
    expect(fetchMock.mock.calls).toHaveLength(requestsBeforeForward);
  });
});

describe("continuous catalogue reduced motion", () => {
  it("disables the actual appended-card animation inside the reduced-motion stylesheet block", () => {
    const stylesheet = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

    expect(stylesheet).toMatch(
      /\.book-card--appended\s*\{\s*animation:\s*catalogue-append 120ms ease-out;\s*\}/,
    );
    expect(stylesheet).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.book-card--appended\s*\{\s*animation:\s*none;\s*\}/,
    );
  });
});
