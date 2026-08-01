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

export interface ParsedCatalogueSearch {
  query: CatalogueBooksQuery;
  canonicalSearch: string;
  wasNormalized: boolean;
  wasInvalid: boolean;
}

export const DEFAULT_CATALOGUE_QUERY = catalogueBooksQuerySchema.parse({});

function rawQuery(search: string): Record<string, string | string[]> {
  const raw: Record<string, string | string[]> = {};

  for (const [key, value] of new URLSearchParams(search)) {
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

  return raw;
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

export function parseCatalogueSearch(search: string): ParsedCatalogueSearch {
  const parsed = catalogueBooksQuerySchema.safeParse(rawQuery(search));

  if (!parsed.success) {
    return {
      query: DEFAULT_CATALOGUE_QUERY,
      canonicalSearch: "",
      wasNormalized: true,
      wasInvalid: true,
    };
  }

  const canonicalSearch = catalogueQueryToSearch(parsed.data);
  return {
    query: parsed.data,
    canonicalSearch,
    wasNormalized: canonicalSearch !== search,
    wasInvalid: false,
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
