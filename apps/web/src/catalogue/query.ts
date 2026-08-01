import {
  CATALOGUE_DEFAULT_PAGE,
  CATALOGUE_DEFAULT_PAGE_SIZE,
  catalogueBooksQuerySchema,
  type CatalogueBooksQuery,
} from "@amazon-2/contracts";

const CATALOGUE_QUERY_KEYS = new Set([
  "q",
  "genre",
  "yearFrom",
  "yearTo",
  "sort",
  "page",
  "pageSize",
]);

export type CatalogueBrowseMode = "pages" | "continuous";

export interface ParsedCatalogueSearch {
  browseMode: CatalogueBrowseMode;
  query: CatalogueBooksQuery;
  canonicalSearch: string;
  wasNormalized: boolean;
  wasInvalid: boolean;
}

export const DEFAULT_CATALOGUE_QUERY = catalogueBooksQuerySchema.parse({});

function rawQuery(search: string): {
  browse: string | string[] | undefined;
  query: Record<string, string | string[]>;
} {
  const raw: Record<string, string | string[]> = {};
  let browse: string | string[] | undefined;

  for (const [key, value] of new URLSearchParams(search)) {
    if (key === "browse") {
      browse = browse === undefined
        ? value
        : Array.isArray(browse)
          ? [...browse, value]
          : [browse, value];
      continue;
    }

    if (!CATALOGUE_QUERY_KEYS.has(key)) {
      raw[key] = value;
      continue;
    }

    const existing = raw[key];
    if (existing === undefined) {
      raw[key] = value;
    } else {
      raw[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    }
  }

  return { browse, query: raw };
}

export function catalogueQueryToSearch(query: CatalogueBooksQuery): string {
  const parameters = new URLSearchParams();

  if (query.q !== undefined) parameters.set("q", query.q);
  if (query.genre !== undefined) parameters.set("genre", query.genre);
  if (query.yearFrom !== undefined) parameters.set("yearFrom", String(query.yearFrom));
  if (query.yearTo !== undefined) parameters.set("yearTo", String(query.yearTo));
  if (query.sort !== "newest") parameters.set("sort", query.sort);
  if (query.page !== CATALOGUE_DEFAULT_PAGE) parameters.set("page", String(query.page));
  if (query.pageSize !== CATALOGUE_DEFAULT_PAGE_SIZE) {
    parameters.set("pageSize", String(query.pageSize));
  }

  const serialized = parameters.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

export function catalogueLocationToSearch(
  query: CatalogueBooksQuery,
  browseMode: CatalogueBrowseMode,
): string {
  const parameters = new URLSearchParams(catalogueQueryToSearch(query));
  if (browseMode === "continuous") parameters.set("browse", "continuous");
  const serialized = parameters.toString();
  return serialized.length > 0 ? `?${serialized}` : "";
}

export function parseCatalogueSearch(search: string): ParsedCatalogueSearch {
  const raw = rawQuery(search);
  const parsed = catalogueBooksQuerySchema.safeParse(raw.query);
  const browseIsValid = raw.browse === undefined || raw.browse === "continuous";
  const browseMode: CatalogueBrowseMode = raw.browse === "continuous" ? "continuous" : "pages";

  if (!parsed.success) {
    return {
      browseMode: "pages",
      query: DEFAULT_CATALOGUE_QUERY,
      canonicalSearch: "",
      wasNormalized: true,
      wasInvalid: true,
    };
  }

  const canonicalSearch = catalogueLocationToSearch(parsed.data, browseMode);
  return {
    browseMode,
    query: parsed.data,
    canonicalSearch,
    wasNormalized: canonicalSearch !== search,
    wasInvalid: !browseIsValid,
  };
}

export function safeReturnCatalogueSearch(value: string | null): string {
  if (value === null || (value !== "" && !value.startsWith("?"))) {
    return "";
  }

  return parseCatalogueSearch(value).canonicalSearch;
}

export function isDefaultCatalogueQuery(query: CatalogueBooksQuery): boolean {
  return catalogueQueryToSearch(query) === "";
}
