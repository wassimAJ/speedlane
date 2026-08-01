import {
  CATALOGUE_DEFAULT_PAGE_SIZE,
  genresResponseSchema,
  type CatalogueBooksQuery,
  type CatalogueBooksResponse,
  type ForYourShelvesResponse,
  type GenresResponse,
} from "@amazon-2/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type FormEvent,
  type RefObject,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { isUnauthenticated, requestJson } from "../api";
import { useAuth } from "../auth/AuthProvider";
import {
  catalogueLocationToSearch,
  isDefaultCatalogueQuery,
  parseCatalogueSearch,
  type CatalogueBrowseMode,
} from "../catalogue/query";
import {
  useCatalogueBooks,
  type CatalogueBooksState,
  type ContinuousAppendState,
} from "../catalogue/useCatalogueBooks";
import { BookSummaryCard } from "../components/BookSummaryCard";
import { FilterForm, type FilterDraft } from "../components/FilterForm";
import { getFavouriteGenres, getForYourShelves } from "../engagement/api";
import { useMediaQuery } from "../hooks/useMediaQuery";

type GenresState =
  | { kind: "loading" }
  | { kind: "ready"; data: GenresResponse }
  | { kind: "error" };

type PersonalisedState =
  | { kind: "checking" }
  | { kind: "absent" }
  | { kind: "loading" }
  | { kind: "ready"; data: ForYourShelvesResponse }
  | { kind: "error"; hasFavourites: boolean };

const PAGE_SIZE_OPTIONS = [12, 24, 48];

function filterDraftFromQuery(query: CatalogueBooksQuery): FilterDraft {
  return {
    genre: query.genre ?? "",
    yearFrom: query.yearFrom === undefined ? "" : String(query.yearFrom),
    yearTo: query.yearTo === undefined ? "" : String(query.yearTo),
  };
}

function validYear(value: string): boolean {
  return value === "" || /^\d{4}$/.test(value) && Number(value) >= 1000 && Number(value) <= 9999;
}

function activeFilterCount(query: CatalogueBooksQuery): number {
  return Number(query.genre !== undefined) +
    Number(query.yearFrom !== undefined) +
    Number(query.yearTo !== undefined);
}

function resultSummary(data: CatalogueBooksResponse): string {
  if (data.meta.totalItems === 0) return "No books found";
  if (data.books.length === 0) return `No books on page ${data.meta.page}`;

  const first = (data.meta.page - 1) * data.meta.pageSize + 1;
  const last = first + data.books.length - 1;
  return `Showing ${first}–${last} of ${data.meta.totalItems} books`;
}

export function CataloguePage() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const parsedSearch = useMemo(() => parseCatalogueSearch(location.search), [location.search]);
  const query = parsedSearch.query;
  const browseMode = parsedSearch.browseMode;
  const [searchDraft, setSearchDraft] = useState(query.q ?? "");
  const [filterDraft, setFilterDraft] = useState<FilterDraft>(() => filterDraftFromQuery(query));
  const [yearError, setYearError] = useState<string | null>(null);
  const [queryNotice, setQueryNotice] = useState(parsedSearch.wasInvalid);
  const [booksAttempt, setBooksAttempt] = useState(0);
  const [genresAttempt, setGenresAttempt] = useState(0);
  const [personalisedAttempt, setPersonalisedAttempt] = useState(0);
  const [genresState, setGenresState] = useState<GenresState>({ kind: "loading" });
  const [personalisedState, setPersonalisedState] = useState<PersonalisedState>({ kind: "checking" });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);
  const firstFilterControlRef = useRef<HTMLSelectElement>(null);
  const resultSummaryRef = useRef<HTMLParagraphElement>(null);
  const focusResultsAfterLoad = useRef(false);
  const continuousSentinelRef = useRef<HTMLDivElement>(null);
  const continuousObserverRef = useRef<IntersectionObserver | null>(null);
  const automaticLoadingPausedRef = useRef(false);
  const loadMoreRef = useRef<(trigger: "automatic" | "manual" | "retry") => Promise<void>>(
    async () => {},
  );
  const userId = auth.state.status === "authenticated" ? auth.state.user.id : "anonymous";
  const books = useCatalogueBooks({
    attempt: booksAttempt,
    browseMode,
    onDepthChange: replaceContinuousDepth,
    onExpireSession: auth.expireSession,
    query,
    userId,
  });
  const readyData = books.data;
  const loadedPage = readyData?.meta.page ?? 0;
  const hasMoreContinuousBooks = browseMode === "continuous" && readyData !== null &&
    readyData.meta.page < readyData.meta.totalPages;
  loadMoreRef.current = books.loadMore;

  useEffect(() => {
    if (parsedSearch.wasNormalized) {
      navigate({ pathname: "/catalogue", search: parsedSearch.canonicalSearch }, { replace: true });
    }
    if (parsedSearch.wasInvalid) setQueryNotice(true);
  }, [navigate, parsedSearch.canonicalSearch, parsedSearch.wasInvalid, parsedSearch.wasNormalized]);

  useEffect(() => {
    setSearchDraft(query.q ?? "");
    setFilterDraft(filterDraftFromQuery(query));
    setYearError(null);
  }, [location.search, query.genre, query.q, query.yearFrom, query.yearTo]);

  useEffect(() => {
    if (books.state.kind !== "ready" || !focusResultsAfterLoad.current) return;
    focusResultsAfterLoad.current = false;
    const frame = window.requestAnimationFrame(() => resultSummaryRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [books.state.kind, loadedPage]);

  useEffect(() => {
    const target = books.restoration;
    if (!target || books.state.kind !== "ready") return;

    const frame = window.requestAnimationFrame(() => {
      const titleLink = target.anchorBookId
        ? document.getElementById(`catalogue-book-${target.anchorBookId}`)?.querySelector<HTMLElement>("[data-book-title-link]")
        : null;

      if (titleLink) {
        titleLink.focus({ preventScroll: true });
        titleLink.scrollIntoView?.({ behavior: "auto", block: "center" });
      } else if (target.anchorBookId === undefined && target.scrollY !== undefined) {
        window.scrollTo({ behavior: "auto", top: target.scrollY });
      } else {
        resultSummaryRef.current?.focus();
      }
      books.clearRestoration();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [books.restoration?.token, books.state.kind]);

  useEffect(() => {
    const target = books.appendFocusTarget;
    if (!target || books.state.kind !== "ready") return;

    const element = target === "end"
      ? document.querySelector<HTMLElement>("[data-continuous-end]")
      : document.getElementById(`catalogue-book-${target}`)?.querySelector<HTMLElement>("[data-book-title-link]");
    if (!element) return;

    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ behavior: "auto", block: "nearest" });
    books.clearAppendFocusTarget();
  }, [books.appendFocusTarget, books.state.kind]);

  useEffect(() => {
    continuousObserverRef.current?.disconnect();
    continuousObserverRef.current = null;

    if (
      browseMode !== "continuous" ||
      !hasMoreContinuousBooks ||
      books.state.kind !== "ready" ||
      books.appendState.kind !== "idle" ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }

    const sentinel = continuousSentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (
        entries.some((entry) => entry.isIntersecting) &&
        !automaticLoadingPausedRef.current
      ) {
        void loadMoreRef.current("automatic");
      }
    }, { rootMargin: "0px 0px 75% 0px" });
    continuousObserverRef.current = observer;
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      if (continuousObserverRef.current === observer) continuousObserverRef.current = null;
    };
  }, [books.appendState.kind, books.state.kind, browseMode, hasMoreContinuousBooks, loadedPage]);

  useEffect(() => {
    const controller = new AbortController();
    setGenresState({ kind: "loading" });

    requestJson("/api/genres", genresResponseSchema, { signal: controller.signal })
      .then((data) => setGenresState({ kind: "ready", data }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isUnauthenticated(error)) {
          auth.expireSession();
          return;
        }
        setGenresState({ kind: "error" });
      });

    return () => controller.abort();
  }, [auth.expireSession, genresAttempt]);

  useEffect(() => {
    const controller = new AbortController();
    let hasFavourites = false;
    setPersonalisedState({ kind: "checking" });

    getFavouriteGenres(controller.signal)
      .then((favourites) => {
        if (favourites.genres.length === 0) {
          setPersonalisedState({ kind: "absent" });
          return null;
        }

        hasFavourites = true;
        setPersonalisedState({ kind: "loading" });
        return getForYourShelves(controller.signal);
      })
      .then((recommendations) => {
        if (recommendations !== null) {
          setPersonalisedState({ kind: "ready", data: recommendations });
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isUnauthenticated(error)) {
          auth.expireSession();
          return;
        }
        setPersonalisedState({
          kind: "error",
          hasFavourites,
        });
      });

    return () => controller.abort();
  }, [auth.expireSession, personalisedAttempt]);

  useEffect(() => {
    if (!filtersOpen || isDesktop) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstFilterControlRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setFiltersOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const dialog = document.querySelector<HTMLElement>("[data-filter-dialog]");
      const controls = dialog?.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]",
      );
      if (!controls || controls.length === 0) return;
      const first = controls.item(0);
      const last = controls.item(controls.length - 1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      filtersTriggerRef.current?.focus();
    };
  }, [filtersOpen, isDesktop]);

  useEffect(() => {
    if (isDesktop && filtersOpen) setFiltersOpen(false);
  }, [filtersOpen, isDesktop]);

  function replaceContinuousDepth(page: number) {
    navigate(
      {
        pathname: "/catalogue",
        search: catalogueLocationToSearch({ ...query, page }, "continuous"),
      },
      { replace: true },
    );
  }

  function commit(
    nextQuery: CatalogueBooksQuery,
    options?: { browseMode?: CatalogueBrowseMode; focusResults?: boolean },
  ) {
    focusResultsAfterLoad.current = options?.focusResults ?? false;
    navigate({
      pathname: "/catalogue",
      search: catalogueLocationToSearch(nextQuery, options?.browseMode ?? browseMode),
    });
  }

  function changeBrowseMode(nextMode: CatalogueBrowseMode) {
    if (nextMode === browseMode) return;
    commit({ ...query, page: 1 }, { browseMode: nextMode });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = searchDraft.trim();
    commit({ ...query, q: q === "" ? undefined : q, page: 1 });
  }

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fromIsValid = validYear(filterDraft.yearFrom);
    const toIsValid = validYear(filterDraft.yearTo);
    const from = filterDraft.yearFrom === "" ? undefined : Number(filterDraft.yearFrom);
    const to = filterDraft.yearTo === "" ? undefined : Number(filterDraft.yearTo);

    if (!fromIsValid || !toIsValid) {
      setYearError("Enter a four-digit year from 1000 to 9999.");
      return;
    }

    if (from !== undefined && to !== undefined && from > to) {
      setYearError("The “from” year must be earlier than or equal to the “to” year.");
      return;
    }

    setYearError(null);
    commit({
      ...query,
      genre: filterDraft.genre === "" ? undefined : filterDraft.genre,
      yearFrom: from,
      yearTo: to,
      page: 1,
    });
    setFiltersOpen(false);
  }

  function resetAll() {
    setSearchDraft("");
    setFilterDraft({ genre: "", yearFrom: "", yearTo: "" });
    setYearError(null);
    setQueryNotice(false);
    navigate({ pathname: "/catalogue", search: "" });
    setFiltersOpen(false);
  }

  function pauseAutomaticLoading() {
    automaticLoadingPausedRef.current = true;
  }

  function resumeAutomaticLoading(event: ReactFocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    automaticLoadingPausedRef.current = false;
    const observer = continuousObserverRef.current;
    const sentinel = continuousSentinelRef.current;
    if (observer && sentinel) {
      observer.unobserve(sentinel);
      observer.observe(sentinel);
    }
  }

  const filterForm = (
    <FilterForm
      draft={filterDraft}
      error={yearError}
      firstControlRef={!isDesktop ? firstFilterControlRef : undefined}
      genres={genresState.kind === "ready" ? genresState.data.genres : []}
      genresError={genresState.kind === "error"}
      isResetDisabled={browseMode === "pages" && isDefaultCatalogueQuery(query)}
      onApply={applyFilters}
      onChange={setFilterDraft}
      onReset={resetAll}
      onRetryGenres={() => setGenresAttempt((attempt) => attempt + 1)}
    />
  );

  const count = activeFilterCount(query);

  return (
    <main className="page-shell" id="main-content">
      <header className="page-heading catalogue-heading">
        <div>
          <p className="eyebrow">THE OPEN STACKS</p>
          <h1>Find your next book</h1>
          <p>Search the active collection by title or author.</p>
        </div>
        {readyData ? <p className="page-heading__count">{readyData.meta.totalItems} books</p> : null}
      </header>

      {queryNotice ? (
        <p className="notice notice--info" role="status">
          Some catalogue options were reset.
        </p>
      ) : null}

      <ForYourShelves
        onRetry={() => setPersonalisedAttempt((value) => value + 1)}
        returnSearch={location.search}
        state={personalisedState}
      />

      <form className="search-form" onSubmit={submitSearch} role="search">
        <div className="field search-form__field">
          <label htmlFor="catalogue-search">Search by title or author</label>
          <input
            autoComplete="off"
            id="catalogue-search"
            maxLength={200}
            name="q"
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Try Octavia Butler"
            type="search"
            value={searchDraft}
          />
        </div>
        <button className="button button--primary search-form__button" type="submit">
          Search
        </button>
      </form>

      <div className="catalogue-workspace">
        {isDesktop ? (
          <aside aria-label="Catalogue filters" className="filter-rail">
            <h2>Filters</h2>
            {filterForm}
          </aside>
        ) : null}

        <section
          aria-busy={books.isBusy ? "true" : undefined}
          aria-labelledby="catalogue-results-title"
          className="result-region"
        >
          <div className="result-toolbar">
            <div>
              <h2 className="visually-hidden" id="catalogue-results-title">Catalogue results</h2>
              <p
                aria-live={browseMode === "pages" ? "polite" : undefined}
                aria-atomic={browseMode === "pages" ? "true" : undefined}
                className="result-summary"
                ref={resultSummaryRef}
                tabIndex={-1}
              >
                {books.state.kind === "loading"
                  ? "Loading books…"
                  : books.state.kind === "restoring"
                    ? "Restoring your place in the catalogue…"
                  : books.state.kind === "error"
                    ? "Catalogue unavailable"
                    : browseMode === "continuous"
                      ? `${books.state.data.books.length} of ${books.state.data.meta.totalItems} books loaded`
                      : resultSummary(books.state.data)}
              </p>
              {books.state.kind === "updating" ? (
                <span className="updating-status" role="status">Updating the catalogue…</span>
              ) : null}
            </div>
            <div className="result-toolbar__controls">
              {!isDesktop ? (
                <button
                  aria-expanded={filtersOpen}
                  className="button button--secondary"
                  onClick={() => setFiltersOpen(true)}
                  ref={filtersTriggerRef}
                  type="button"
                >
                  Filters{count > 0 ? ` (${count})` : ""}
                </button>
              ) : null}
              <div className="compact-field">
                <label htmlFor="catalogue-sort">Sort by</label>
                <select
                  id="catalogue-sort"
                  name="sort"
                  onChange={(event) =>
                    commit({ ...query, sort: event.target.value as CatalogueBooksQuery["sort"], page: 1 })
                  }
                  value={query.sort}
                >
                  <option value="newest">Newest</option>
                  <option value="title">Title A–Z</option>
                  <option value="rating">Highest rated</option>
                </select>
              </div>
              <BrowseModeControl browseMode={browseMode} onChange={changeBrowseMode} />
            </div>
          </div>

          <div
            className={browseMode === "continuous" ? "continuous-results-zone" : undefined}
            onBlurCapture={browseMode === "continuous" ? resumeAutomaticLoading : undefined}
            onFocusCapture={browseMode === "continuous" ? pauseAutomaticLoading : undefined}
          >
            <CatalogueResults
              appendedIds={books.appendedIds}
              browseMode={browseMode}
              data={readyData}
              isDefaultQuery={isDefaultCatalogueQuery(query)}
              isUpdating={books.state.kind === "updating"}
              onFirstPage={() => commit({ ...query, page: 1 }, { focusResults: true })}
              onNavigateBook={books.rememberBookAnchor}
              onReset={resetAll}
              onRetry={() => setBooksAttempt((attempt) => attempt + 1)}
              returnSearch={location.search}
              state={books.state.kind}
            />

            {browseMode === "continuous" ? (
              <ContinuousBrowsingControls
                announcement={books.announcement}
                appendState={books.appendState}
                data={readyData}
                hasMore={hasMoreContinuousBooks}
                onLoadMore={books.loadMore}
                onPageSize={(pageSize) => commit({ ...query, pageSize, page: 1 })}
                pageSize={query.pageSize}
                sentinelRef={continuousSentinelRef}
                state={books.state.kind}
              />
            ) : null}
          </div>

          {browseMode === "pages" && readyData && readyData.meta.totalItems > 0 ? (
            <Pagination
              data={readyData}
              onPage={(page) => commit({ ...query, page }, { focusResults: true })}
              onPageSize={(pageSize) => commit({ ...query, pageSize, page: 1 })}
            />
          ) : null}
        </section>
      </div>

      {!isDesktop && filtersOpen ? (
        <div className="drawer-layer">
          <button
            aria-label="Close filters"
            className="drawer-scrim"
            onClick={() => setFiltersOpen(false)}
            type="button"
          />
          <section
            aria-labelledby="filter-dialog-title"
            aria-modal="true"
            className="filter-drawer"
            data-filter-dialog
            role="dialog"
          >
            <div className="filter-drawer__heading">
              <h2 id="filter-dialog-title">Filters</h2>
              <button className="button button--quiet" onClick={() => setFiltersOpen(false)} type="button">
                Close filters
              </button>
            </div>
            {filterForm}
          </section>
        </div>
      ) : null}
    </main>
  );
}

function BrowseModeControl({
  browseMode,
  onChange,
}: {
  browseMode: CatalogueBrowseMode;
  onChange(mode: CatalogueBrowseMode): void;
}) {
  return (
    <fieldset className="browse-mode">
      <legend>Browse mode</legend>
      <div className="browse-mode__options">
        <label>
          <input
            checked={browseMode === "pages"}
            name="catalogue-browse-mode"
            onChange={() => onChange("pages")}
            type="radio"
            value="pages"
          />
          <span>Pages</span>
        </label>
        <label>
          <input
            checked={browseMode === "continuous"}
            name="catalogue-browse-mode"
            onChange={() => onChange("continuous")}
            type="radio"
            value="continuous"
          />
          <span>Continuous</span>
        </label>
      </div>
    </fieldset>
  );
}

function CatalogueResults({
  appendedIds,
  browseMode,
  data,
  isDefaultQuery,
  isUpdating,
  onFirstPage,
  onNavigateBook,
  onReset,
  onRetry,
  returnSearch,
  state,
}: {
  appendedIds: Set<string>;
  browseMode: CatalogueBrowseMode;
  data: CatalogueBooksResponse | null;
  isDefaultQuery: boolean;
  isUpdating: boolean;
  onFirstPage(): void;
  onNavigateBook(bookId: string): void;
  onReset(): void;
  onRetry(): void;
  returnSearch: string;
  state: CatalogueBooksState["kind"];
}) {
  if (state === "loading" || state === "restoring") return <CatalogueSkeleton />;

  if (state === "error") {
    return (
      <div className="result-message">
        <h3>We couldn’t load the shelves.</h3>
        <p>Check your connection and try again.</p>
        <button className="button button--secondary" onClick={onRetry} type="button">Try again</button>
      </div>
    );
  }

  if (data === null) return null;

  if (data.meta.totalItems === 0) {
    return (
      <div className="result-message">
        <h3>{isDefaultQuery ? "The open stacks are empty." : "No books found in that stack."}</h3>
        <p>{isDefaultQuery ? "Check back after the librarian adds a book." : "Try a shorter search or clear a filter."}</p>
        {!isDefaultQuery ? <button className="button button--quiet" onClick={onReset} type="button">Reset all</button> : null}
      </div>
    );
  }

  if (data.books.length === 0) {
    return (
      <div className="result-message">
        <h3>There are no books on this page.</h3>
        <p>Return to the first page of these results.</p>
        <button className="button button--secondary" onClick={onFirstPage} type="button">First page</button>
      </div>
    );
  }

  return (
    <ul
      className={`book-grid${isUpdating ? " book-grid--updating" : ""}${browseMode === "continuous" ? " book-grid--continuous" : ""}`}
    >
      {data.books.map((book) => (
        <BookSummaryCard
          book={book}
          isAppended={appendedIds.has(book.id)}
          key={book.id}
          onNavigate={onNavigateBook}
          returnSearch={returnSearch}
        />
      ))}
    </ul>
  );
}

function ContinuousBrowsingControls({
  announcement,
  appendState,
  data,
  hasMore,
  onLoadMore,
  onPageSize,
  pageSize,
  sentinelRef,
  state,
}: {
  announcement: string;
  appendState: ContinuousAppendState;
  data: CatalogueBooksResponse | null;
  hasMore: boolean;
  onLoadMore(trigger: "automatic" | "manual" | "retry"): Promise<void>;
  onPageSize(pageSize: number): void;
  pageSize: number;
  sentinelRef: RefObject<HTMLDivElement | null>;
  state: CatalogueBooksState["kind"];
}) {
  const isLoading = appendState.kind === "loading";
  const isError = appendState.kind === "error";
  const hasResults = data !== null && data.meta.totalItems > 0;
  const isEnd = hasResults && (appendState.kind === "end" || !hasMore);
  const visibleStatus = state === "restoring"
    ? "Restoring your place in the catalogue…"
    : data === null
      ? state === "error" ? "Catalogue unavailable" : "Loading books…"
      : data.meta.totalItems === 0
        ? ""
        : isEnd
          ? `You’ve reached the end of the catalogue. ${data.books.length} books shown.`
          : isError
            ? "We couldn’t load more books."
            : isLoading
              ? "Loading more books…"
              : `${data.books.length} of ${data.meta.totalItems} books loaded`;
  const actionLabel = isError
    ? "Try loading more"
    : isLoading
      ? "Loading more books…"
      : "Load more books";

  return (
    <div className="continuous-browsing">
      <div aria-hidden="true" className="continuous-sentinel" ref={sentinelRef} />
      <div className="continuous-status" data-continuous-end={isEnd ? "" : undefined} tabIndex={isEnd ? -1 : undefined}>
        <p>{visibleStatus}</p>
        {hasResults && !isEnd ? (
          <button
            className="button button--secondary continuous-load-button"
            disabled={isLoading}
            onClick={() => void onLoadMore(isError ? "retry" : "manual")}
            type="button"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      <PageSizeField
        label="Books per load"
        onPageSize={onPageSize}
        pageSize={pageSize}
      />
      <p aria-atomic="true" aria-live="polite" className="visually-hidden">
        {announcement}
      </p>
    </div>
  );
}

function CatalogueSkeleton() {
  return (
    <div aria-hidden="true" className="book-grid skeleton-grid">
      {Array.from({ length: 8 }, (_, index) => (
        <div className="book-card" key={index}>
          <div className="skeleton skeleton--cover" />
          <div className="book-card__metadata">
            <div className="skeleton skeleton--line skeleton--long" />
            <div className="skeleton skeleton--line" />
            <div className="skeleton skeleton--line skeleton--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ForYourShelves({
  onRetry,
  returnSearch,
  state,
}: {
  onRetry(): void;
  returnSearch: string;
  state: PersonalisedState;
}) {
  if (state.kind === "checking" || state.kind === "absent") return null;

  if (state.kind === "error" && !state.hasFavourites) {
    return (
      <div className="personalised-unavailable notice notice--info">
        <span>We couldn’t check your personalised picks.</span>
        <button className="button button--quiet" onClick={onRetry} type="button">Try again</button>
      </div>
    );
  }

  return (
    <section aria-labelledby="for-your-shelves-heading" className="personalised-section">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">PICKED FOR YOU</p>
          <h2 id="for-your-shelves-heading">For your shelves</h2>
          <p>Fresh picks from your favourite corners of the library.</p>
        </div>
      </div>

      {state.kind === "loading" ? (
        <p aria-live="polite" className="personalised-status">Loading personalised picks…</p>
      ) : state.kind === "error" ? (
        <div className="inline-error personalised-status">
          <p>We couldn’t load your personalised picks.</p>
          <button className="button button--quiet" onClick={onRetry} type="button">Try again</button>
        </div>
      ) : state.data.books.length === 0 ? (
        <p className="personalised-status">No fresh picks are available right now.</p>
      ) : (
        <ul className="book-grid personalised-grid">
          {state.data.books.map((book) => (
            <BookSummaryCard book={book} key={book.id} returnSearch={returnSearch} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Pagination({
  data,
  onPage,
  onPageSize,
}: {
  data: CatalogueBooksResponse;
  onPage(page: number): void;
  onPageSize(pageSize: number): void;
}) {
  const { page, pageSize, totalPages } = data.meta;
  const nearbyPages = Array.from(
    new Set([1, page - 1, page, page + 1, totalPages]),
  ).filter((candidate) => candidate >= 1 && candidate <= totalPages);

  return (
    <div className="pagination-block">
      <nav aria-label="Catalogue pages" className="pagination">
        <button className="button button--secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} type="button">
          Previous
        </button>
        <span className="pagination__mobile-status">Page {page} of {totalPages}</span>
        <div className="pagination__numbers">
          {nearbyPages.map((candidate, index) => (
            <span className="pagination__number-group" key={candidate}>
              {index > 0 && (nearbyPages[index - 1] ?? candidate) < candidate - 1 ? <span aria-hidden="true">…</span> : null}
              <button
                aria-current={candidate === page ? "page" : undefined}
                aria-label={`Page ${candidate}`}
                className={candidate === page ? "page-button page-button--current" : "page-button"}
                disabled={candidate === page}
                onClick={() => onPage(candidate)}
                type="button"
              >
                {candidate}
              </button>
            </span>
          ))}
        </div>
        <button className="button button--secondary" disabled={page >= totalPages} onClick={() => onPage(page + 1)} type="button">
          Next
        </button>
      </nav>
      <PageSizeField label="Books per page" onPageSize={onPageSize} pageSize={pageSize} />
    </div>
  );
}

function PageSizeField({
  label,
  onPageSize,
  pageSize,
}: {
  label: "Books per load" | "Books per page";
  onPageSize(pageSize: number): void;
  pageSize: number;
}) {
  const pageSizes = PAGE_SIZE_OPTIONS.includes(pageSize)
    ? PAGE_SIZE_OPTIONS
    : [...PAGE_SIZE_OPTIONS, pageSize].sort((left, right) => left - right);

  return (
    <div className="compact-field page-size-field">
      <label htmlFor="catalogue-page-size">{label}</label>
      <select
        id="catalogue-page-size"
        name="pageSize"
        onChange={(event) => onPageSize(Number(event.target.value))}
        value={pageSize}
      >
        {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
      </select>
    </div>
  );
}
