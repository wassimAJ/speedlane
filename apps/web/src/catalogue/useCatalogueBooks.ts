import {
  catalogueBooksResponseSchema,
  type CatalogueBookSummary,
  type CatalogueBooksQuery,
  type CatalogueBooksResponse,
} from "@amazon-2/contracts";
import { useEffect, useRef, useState } from "react";

import { isUnauthenticated, requestJson } from "../api";
import {
  catalogueQueryToSearch,
  type CatalogueBrowseMode,
} from "./query";

export type CatalogueBooksState =
  | { kind: "loading" }
  | { kind: "restoring" }
  | { kind: "updating"; data: CatalogueBooksResponse }
  | { kind: "ready"; data: CatalogueBooksResponse }
  | { kind: "error" };

export type ContinuousAppendState =
  | { kind: "idle" }
  | { kind: "loading"; trigger: "automatic" | "manual" | "retry" }
  | { kind: "error" }
  | { kind: "end" };

interface ContinuousCacheEntry {
  anchorBookId?: string;
  pages: Map<number, CatalogueBooksResponse>;
  scrollY?: number;
}

interface PageRequest {
  controller: AbortController;
  consumers: number;
  promise: Promise<CatalogueBooksResponse>;
}

export interface CatalogueRestorationTarget {
  anchorBookId?: string;
  scrollY?: number;
  token: number;
}

const continuousCache = new Map<string, ContinuousCacheEntry>();
const continuousRequests = new Map<string, PageRequest>();

function pageRequestKey(fingerprint: string, page: number) {
  return `${fingerprint}|page=${page}`;
}

function cacheEntry(fingerprint: string) {
  const cached = continuousCache.get(fingerprint);
  if (cached) return cached;

  const created: ContinuousCacheEntry = { pages: new Map() };
  continuousCache.set(fingerprint, created);
  return created;
}

function acquireContinuousPage(
  fingerprint: string,
  query: CatalogueBooksQuery,
  page: number,
): { promise: Promise<CatalogueBooksResponse>; release(): void } {
  const entry = cacheEntry(fingerprint);
  const cached = entry.pages.get(page);
  if (cached) return { promise: Promise.resolve(cached), release() {} };

  const key = pageRequestKey(fingerprint, page);
  let request = continuousRequests.get(key);

  if (!request) {
    const controller = new AbortController();
    const promise = requestJson(
      `/api/books${catalogueQueryToSearch({ ...query, page })}`,
      catalogueBooksResponseSchema,
      { signal: controller.signal },
    ).then((response) => {
      if (response.meta.page !== page) {
        throw new Error("Catalogue page response did not match the requested page.");
      }
      entry.pages.set(page, response);
      return response;
    }).finally(() => {
      continuousRequests.delete(key);
    });

    request = { controller, consumers: 0, promise };
    continuousRequests.set(key, request);
  }

  request.consumers += 1;
  let released = false;

  return {
    promise: request.promise,
    release() {
      if (released) return;
      released = true;
      request.consumers -= 1;
      if (request.consumers !== 0) return;

      window.setTimeout(() => {
        if (request.consumers === 0 && continuousRequests.get(key) === request) {
          request.controller.abort();
        }
      }, 0);
    },
  };
}

function mergePages(pages: CatalogueBooksResponse[]): CatalogueBooksResponse {
  const books: CatalogueBookSummary[] = [];
  const seenIds = new Set<string>();

  for (const page of pages) {
    for (const book of page.books) {
      if (seenIds.has(book.id)) continue;
      seenIds.add(book.id);
      books.push(book);
    }
  }

  const lastPage = pages.at(-1);
  if (!lastPage) throw new Error("At least one catalogue page is required.");

  return {
    books,
    meta: {
      ...lastPage.meta,
      page: pages.length,
    },
  };
}

export function useCatalogueBooks({
  attempt,
  browseMode,
  onDepthChange,
  onExpireSession,
  query,
  userId,
}: {
  attempt: number;
  browseMode: CatalogueBrowseMode;
  onDepthChange(page: number): void;
  onExpireSession(): void;
  query: CatalogueBooksQuery;
  userId: string;
}) {
  const baseQuerySearch = catalogueQueryToSearch({ ...query, page: 1 });
  const fingerprint = `${userId}|${baseQuerySearch}`;
  const targetPage = query.page;
  const [state, setState] = useState<CatalogueBooksState>({ kind: "loading" });
  const [appendState, setAppendState] = useState<ContinuousAppendState>({ kind: "idle" });
  const [announcement, setAnnouncement] = useState("");
  const [appendedIds, setAppendedIds] = useState<Set<string>>(() => new Set());
  const [appendFocusTarget, setAppendFocusTarget] = useState<string | "end" | null>(null);
  const [restoration, setRestoration] = useState<CatalogueRestorationTarget | null>(null);
  const generationRef = useRef(0);
  const modeRef = useRef<CatalogueBrowseMode>(browseMode);
  const activeFingerprintRef = useRef("");
  const dataRef = useRef<CatalogueBooksResponse | null>(null);
  const loadedThroughRef = useRef(0);
  const requestedPagesRef = useRef(new Set<number>());
  const inFlightPageRef = useRef<number | null>(null);
  const releaseInitialRequestRef = useRef<(() => void) | null>(null);
  const releaseAppendRequestRef = useRef<(() => void) | null>(null);
  const failedPageRef = useRef<number | null>(null);
  const queryRef = useRef(query);
  const browseModeRef = useRef(browseMode);
  const depthChangeRef = useRef(onDepthChange);
  const expireSessionRef = useRef(onExpireSession);
  queryRef.current = query;
  browseModeRef.current = browseMode;
  depthChangeRef.current = onDepthChange;
  expireSessionRef.current = onExpireSession;

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const previousMode = modeRef.current;
    modeRef.current = browseMode;
    releaseInitialRequestRef.current?.();
    releaseInitialRequestRef.current = null;
    releaseAppendRequestRef.current?.();
    releaseAppendRequestRef.current = null;
    inFlightPageRef.current = null;
    failedPageRef.current = null;

    if (
      browseMode === "continuous" &&
      activeFingerprintRef.current === fingerprint &&
      loadedThroughRef.current === targetPage &&
      dataRef.current !== null
    ) {
      setState({ kind: "ready", data: dataRef.current });
      return;
    }

    setAppendState({ kind: "idle" });
    setAppendedIds(new Set());
    setAppendFocusTarget(null);
    setRestoration(null);

    if (browseMode === "pages") {
      const controller = new AbortController();
      activeFingerprintRef.current = "";
      dataRef.current = null;
      loadedThroughRef.current = 0;
      requestedPagesRef.current = new Set();
      setAnnouncement("");
      setState((current) =>
        previousMode === "pages" && (current.kind === "ready" || current.kind === "updating")
          ? { kind: "updating", data: current.data }
          : { kind: "loading" },
      );

      requestJson(
        `/api/books${catalogueQueryToSearch(query)}`,
        catalogueBooksResponseSchema,
        { signal: controller.signal },
      ).then((data) => {
        if (controller.signal.aborted || generationRef.current !== generation) return;
        setState({ kind: "ready", data });
      }).catch((error: unknown) => {
        if (controller.signal.aborted || generationRef.current !== generation) return;
        if (isUnauthenticated(error)) {
          expireSessionRef.current();
          return;
        }
        setState({ kind: "error" });
      });

      return () => controller.abort();
    }

    activeFingerprintRef.current = fingerprint;
    dataRef.current = null;
    loadedThroughRef.current = 0;
    requestedPagesRef.current = new Set();
    const restoring = targetPage > 1;
    setState({ kind: restoring ? "restoring" : "loading" });
    setAnnouncement(restoring ? "Restoring your place in the catalogue…" : "");

    let cancelled = false;
    const entry = cacheEntry(fingerprint);

    async function restoreContinuousPages() {
      try {
        const pages: CatalogueBooksResponse[] = [];
        let restoreThrough = targetPage;

        for (let page = 1; page <= restoreThrough; page += 1) {
          if (cancelled || generationRef.current !== generation) return;
          requestedPagesRef.current.add(page);
          const acquired = acquireContinuousPage(fingerprint, query, page);
          releaseInitialRequestRef.current = acquired.release;
          const response = await acquired.promise;
          acquired.release();
          if (releaseInitialRequestRef.current === acquired.release) {
            releaseInitialRequestRef.current = null;
          }
          if (cancelled || generationRef.current !== generation) return;
          pages.push(response);
          if (page === 1) {
            restoreThrough = Math.min(targetPage, Math.max(1, response.meta.totalPages));
          }
        }

        const data = mergePages(pages);
        dataRef.current = data;
        loadedThroughRef.current = data.meta.page;
        setState({ kind: "ready", data });
        setAppendState(data.meta.page >= data.meta.totalPages ? { kind: "end" } : { kind: "idle" });
        setAnnouncement(
          restoring
            ? `${data.books.length} of ${data.meta.totalItems} books loaded.`
            : `Continuous browsing selected. ${data.books.length} of ${data.meta.totalItems} books loaded.`,
        );

        if (data.meta.page !== targetPage) depthChangeRef.current(data.meta.page);
        if (restoring || entry.anchorBookId !== undefined) {
          setRestoration({
            anchorBookId: entry.anchorBookId,
            scrollY: entry.scrollY,
            token: generation,
          });
        }
      } catch (error: unknown) {
        if (cancelled || generationRef.current !== generation) return;
        if (isUnauthenticated(error)) {
          expireSessionRef.current();
          return;
        }
        setState({ kind: "error" });
      }
    }

    void restoreContinuousPages();

    return () => {
      cancelled = true;
      releaseInitialRequestRef.current?.();
      releaseInitialRequestRef.current = null;
    };
  }, [attempt, browseMode, fingerprint, targetPage]);

  async function loadMore(trigger: "automatic" | "manual" | "retry") {
    const data = dataRef.current;
    const activeFingerprint = activeFingerprintRef.current;
    if (
      browseModeRef.current !== "continuous" ||
      data === null ||
      inFlightPageRef.current !== null ||
      activeFingerprint === ""
    ) {
      return;
    }

    const nextPage = failedPageRef.current ?? loadedThroughRef.current + 1;
    if (nextPage > data.meta.totalPages) {
      setAppendState({ kind: "end" });
      return;
    }
    if (requestedPagesRef.current.has(nextPage)) return;

    const generation = generationRef.current;
    requestedPagesRef.current.add(nextPage);
    inFlightPageRef.current = nextPage;
    setAppendState({ kind: "loading", trigger });
    setAnnouncement(trigger === "retry" ? "Trying to load more books." : "Loading more books…");
    const acquired = acquireContinuousPage(activeFingerprint, queryRef.current, nextPage);
    releaseAppendRequestRef.current = acquired.release;

    try {
      const response = await acquired.promise;
      acquired.release();
      if (releaseAppendRequestRef.current === acquired.release) {
        releaseAppendRequestRef.current = null;
      }
      if (
        generationRef.current !== generation ||
        activeFingerprintRef.current !== activeFingerprint ||
        inFlightPageRef.current !== nextPage
      ) {
        return;
      }

      const seenIds = new Set(dataRef.current?.books.map((book) => book.id));
      const uniqueBooks = response.books.filter((book) => {
        if (seenIds.has(book.id)) return false;
        seenIds.add(book.id);
        return true;
      });
      const books = [...(dataRef.current?.books ?? []), ...uniqueBooks];
      const nextData: CatalogueBooksResponse = {
        books,
        meta: { ...response.meta, page: nextPage },
      };
      dataRef.current = nextData;
      loadedThroughRef.current = nextPage;
      inFlightPageRef.current = null;
      failedPageRef.current = null;
      setAppendedIds(new Set(uniqueBooks.map((book) => book.id)));
      setState({ kind: "ready", data: nextData });
      const reachedEnd = nextPage >= response.meta.totalPages;
      setAppendState(reachedEnd ? { kind: "end" } : { kind: "idle" });
      depthChangeRef.current(nextPage);

      const endMessage = `You’ve reached the end of the catalogue. ${books.length} books shown.`;
      setAnnouncement(
        reachedEnd
          ? endMessage
          : `Loaded ${uniqueBooks.length} more books. ${books.length} of ${response.meta.totalItems} shown.`,
      );

      if (trigger !== "automatic") {
        setAppendFocusTarget(uniqueBooks[0]?.id ?? (reachedEnd ? "end" : null));
      }
    } catch (error: unknown) {
      acquired.release();
      if (releaseAppendRequestRef.current === acquired.release) {
        releaseAppendRequestRef.current = null;
      }
      if (
        generationRef.current !== generation ||
        activeFingerprintRef.current !== activeFingerprint
      ) {
        return;
      }
      requestedPagesRef.current.delete(nextPage);
      inFlightPageRef.current = null;
      failedPageRef.current = nextPage;
      if (isUnauthenticated(error)) {
        expireSessionRef.current();
        return;
      }
      setAppendState({ kind: "error" });
      setAnnouncement("More books could not be loaded.");
    }
  }

  function rememberBookAnchor(bookId: string) {
    if (browseModeRef.current !== "continuous") return;
    const fingerprintValue = activeFingerprintRef.current;
    if (fingerprintValue === "") return;
    const entry = cacheEntry(fingerprintValue);
    entry.anchorBookId = bookId;
    entry.scrollY = window.scrollY;
  }

  const data = state.kind === "ready" || state.kind === "updating" ? state.data : null;

  return {
    announcement,
    appendFocusTarget,
    appendState,
    appendedIds,
    clearAppendFocusTarget: () => setAppendFocusTarget(null),
    clearRestoration: () => setRestoration(null),
    data,
    isBusy:
      state.kind === "loading" ||
      state.kind === "restoring" ||
      state.kind === "updating" ||
      appendState.kind === "loading",
    loadMore,
    rememberBookAnchor,
    restoration,
    state,
  };
}
