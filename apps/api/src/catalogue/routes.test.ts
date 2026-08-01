import {
  CATALOGUE_DEFAULT_PAGE,
  CATALOGUE_DEFAULT_PAGE_SIZE,
  CATALOGUE_MAX_PAGE,
  catalogueBookDetailResponseSchema,
  catalogueBookNotFoundErrorResponseSchema,
  catalogueBooksResponseSchema,
  catalogueInvalidBookIdErrorResponseSchema,
  catalogueInvalidQueryErrorResponseSchema,
  catalogueUnauthenticatedErrorResponseSchema,
  genresResponseSchema,
  type CatalogueBookDetail,
  type CatalogueBookSummary,
  type GenreSummary,
  type Role,
} from "@amazon-2/contracts";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp, type AppConfig, type AppDatabase } from "../app.js";
import { SESSION_COOKIE_NAME } from "../auth/cookie.js";
import type { AuthenticationUserRecord } from "../auth/middleware.js";
import { createSessionToken } from "../auth/token.js";

const config: AppConfig = {
  corsOrigin: "http://localhost:5173",
  jwtSecret: "test-only-secret-with-more-than-thirty-two-characters",
  sessionTtlSeconds: 900,
  secureCookie: false,
};

const genre: GenreSummary = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Science Fiction",
  slug: "science-fiction",
};

const summary: CatalogueBookSummary = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "The Quiet Orbit",
  author: "Avery Stone",
  publicationYear: 2024,
  rating: 4.8,
  coverSeed: "quiet-orbit",
  genres: [genre],
};

const detail: CatalogueBookDetail = {
  ...summary,
  subtitle: "Notes from the outer shelf",
  synopsis: "A long-form catalogue detail synopsis.",
  isbn: "9781234567890",
  pageCount: 336,
  language: "English",
};

function authenticatedUser(role: Role): AuthenticationUserRecord {
  return {
    id:
      role === "LIBRARIAN"
        ? "00000000-0000-4000-8000-000000000002"
        : "00000000-0000-4000-8000-000000000001",
    email:
      role === "LIBRARIAN"
        ? "librarian@amazon2.local"
        : "reader@amazon2.local",
    displayName: role === "LIBRARIAN" ? "Morgan Librarian" : "Riley Reader",
    role,
    emailVerifiedAt: new Date("2023-01-01T00:00:00.000Z"),
  };
}

function testDatabase(
  role: Role = "READER",
  overrides: Partial<AppDatabase> = {},
): AppDatabase {
  const user = authenticatedUser(role);

  return {
    check: vi.fn().mockResolvedValue(undefined),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn().mockResolvedValue(user),
    findPublicBookPreviews: vi.fn().mockResolvedValue([]),
    findCatalogueBooks: vi.fn().mockResolvedValue({
      books: [summary],
      totalItems: 1,
    }),
    findCatalogueBookById: vi.fn().mockResolvedValue(detail),
    findActiveGenres: vi.fn().mockResolvedValue([genre]),
    findFavouriteGenres: vi.fn().mockResolvedValue([]),
    replaceFavouriteGenres: vi.fn().mockResolvedValue([]),
    findForYourShelves: vi.fn().mockResolvedValue([]),
    findReadingList: vi.fn().mockResolvedValue([]),
    upsertReadingListEntry: vi.fn().mockResolvedValue(null),
    removeReadingListEntry: vi.fn().mockResolvedValue(undefined),
    findAdminBooks: vi.fn().mockResolvedValue([]),
    createAdminBook: vi.fn().mockResolvedValue({ kind: "not_found" }),
    updateAdminBook: vi.fn().mockResolvedValue({ kind: "not_found" }),
    archiveAdminBook: vi.fn().mockResolvedValue({ kind: "not_found" }),
    restoreAdminBook: vi.fn().mockResolvedValue({ kind: "not_found" }),
    findAdminGenres: vi.fn().mockResolvedValue([]),
    createAdminGenre: vi.fn().mockResolvedValue({ kind: "not_found" }),
    updateAdminGenre: vi.fn().mockResolvedValue({ kind: "not_found" }),
    archiveAdminGenre: vi.fn().mockResolvedValue({ kind: "not_found" }),
    restoreAdminGenre: vi.fn().mockResolvedValue({ kind: "not_found" }),
    ...overrides,
  };
}

function sessionCookie(role: Role = "READER") {
  const token = createSessionToken(authenticatedUser(role).id, {
    secret: config.jwtSecret,
    ttlSeconds: config.sessionTtlSeconds,
  });

  return `${SESSION_COOKIE_NAME}=${token}`;
}

describe("authenticated catalogue routes", () => {
  it.each([
    "/api/books",
    `/api/books/${summary.id}`,
    "/api/genres",
  ])("rejects unauthenticated access to %s", async (path) => {
    const database = testDatabase();
    const response = await request(createApp(database, config)).get(path).expect(401);

    expect(catalogueUnauthenticatedErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      },
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(database.findCatalogueBooks).not.toHaveBeenCalled();
    expect(database.findCatalogueBookById).not.toHaveBeenCalled();
    expect(database.findActiveGenres).not.toHaveBeenCalled();
  });

  it.each(["READER", "LIBRARIAN"] as const)(
    "allows a %s to use every reader-facing catalogue route",
    async (role) => {
      const database = testDatabase(role);
      const app = createApp(database, config);
      const cookie = sessionCookie(role);

      const listResponse = await request(app)
        .get("/api/books")
        .set("Cookie", cookie)
        .expect(200);
      const detailResponse = await request(app)
        .get(`/api/books/${summary.id}`)
        .set("Cookie", cookie)
        .expect(200);
      const genresResponse = await request(app)
        .get("/api/genres")
        .set("Cookie", cookie)
        .expect(200);

      expect(catalogueBooksResponseSchema.parse(listResponse.body).books).toEqual([
        summary,
      ]);
      expect(
        catalogueBookDetailResponseSchema.parse(detailResponse.body).book,
      ).toEqual(detail);
      expect(genresResponseSchema.parse(genresResponse.body).genres).toEqual([
        genre,
      ]);
    },
  );
});

describe("GET /api/books query contract", () => {
  it("applies contract defaults and returns exact pagination metadata", async () => {
    const database = testDatabase("READER", {
      findCatalogueBooks: vi.fn().mockResolvedValue({
        books: [summary],
        totalItems: 49,
      }),
    });
    const response = await request(createApp(database, config))
      .get("/api/books")
      .set("Cookie", sessionCookie())
      .expect(200);

    expect(database.findCatalogueBooks).toHaveBeenCalledWith({
      sort: "newest",
      page: CATALOGUE_DEFAULT_PAGE,
      pageSize: CATALOGUE_DEFAULT_PAGE_SIZE,
    });
    expect(catalogueBooksResponseSchema.parse(response.body)).toEqual({
      books: [summary],
      meta: {
        page: 1,
        pageSize: 24,
        totalItems: 49,
        totalPages: 3,
      },
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(Object.keys(response.body.books[0])).toEqual([
      "id",
      "title",
      "author",
      "publicationYear",
      "rating",
      "coverSeed",
      "genres",
    ]);
  });

  it("normalizes and passes all approved filters, sort, and pagination", async () => {
    const database = testDatabase();

    await request(createApp(database, config))
      .get(
        "/api/books?q=%20Orbit%20&genre=science-fiction&yearFrom=2001&yearTo=2024&sort=rating&page=3&pageSize=48",
      )
      .set("Cookie", sessionCookie())
      .expect(200);

    expect(database.findCatalogueBooks).toHaveBeenCalledWith({
      q: "Orbit",
      genre: "science-fiction",
      yearFrom: 2001,
      yearTo: 2024,
      sort: "rating",
      page: 3,
      pageSize: 48,
    });
  });

  it.each([
    ["an unknown parameter", "unknown=true"],
    ["a repeated parameter", "sort=newest&sort=title"],
    ["an empty search after trimming", "q=%20%20"],
    ["a malformed year", "yearFrom=twenty"],
    ["a reversed year range", "yearFrom=2025&yearTo=2024"],
    ["a malformed page", "page=1.5"],
    ["a page size above the maximum", "pageSize=49"],
  ])("rejects %s with the exact invalid-query error", async (_case, query) => {
    const database = testDatabase();
    const response = await request(createApp(database, config))
      .get(`/api/books?${query}`)
      .set("Cookie", sessionCookie())
      .expect(400);

    expect(catalogueInvalidQueryErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Catalogue query is invalid.",
      },
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(database.findCatalogueBooks).not.toHaveBeenCalled();
  });

  it("accepts the contract-owned maximum page", async () => {
    const database = testDatabase();

    await request(createApp(database, config))
      .get(`/api/books?page=${CATALOGUE_MAX_PAGE}`)
      .set("Cookie", sessionCookie())
      .expect(200);

    expect(database.findCatalogueBooks).toHaveBeenCalledWith({
      sort: "newest",
      page: CATALOGUE_MAX_PAGE,
      pageSize: CATALOGUE_DEFAULT_PAGE_SIZE,
    });
  });

  it.each([
    ["one above the maximum", String(CATALOGUE_MAX_PAGE + 1)],
    ["36 all-numeric digits", "9".repeat(36)],
    ["308 all-numeric digits", "9".repeat(308)],
  ])("rejects a page with %s before store execution", async (_case, page) => {
    const database = testDatabase();
    const response = await request(createApp(database, config))
      .get(`/api/books?page=${page}`)
      .set("Cookie", sessionCookie())
      .expect(400);

    expect(catalogueInvalidQueryErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Catalogue query is invalid.",
      },
    });
    expect(database.findCatalogueBooks).not.toHaveBeenCalled();
  });
});

describe("GET /api/books/:bookId", () => {
  it("rejects a malformed UUID with the exact invalid-ID error", async () => {
    const database = testDatabase();
    const response = await request(createApp(database, config))
      .get("/api/books/not-a-uuid")
      .set("Cookie", sessionCookie())
      .expect(400);

    expect(catalogueInvalidBookIdErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Book identifier is invalid.",
      },
    });
    expect(database.findCatalogueBookById).not.toHaveBeenCalled();
  });

  it("uses the same not-found response when no active book is returned", async () => {
    const database = testDatabase("READER", {
      findCatalogueBookById: vi.fn().mockResolvedValue(null),
    });
    const response = await request(createApp(database, config))
      .get(`/api/books/${summary.id}`)
      .set("Cookie", sessionCookie())
      .expect(404);

    expect(catalogueBookNotFoundErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Book not found.",
      },
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it("returns only the contract-approved detail shape", async () => {
    const response = await request(createApp(testDatabase(), config))
      .get(`/api/books/${summary.id}`)
      .set("Cookie", sessionCookie())
      .expect(200);
    const parsed = catalogueBookDetailResponseSchema.parse(response.body);

    expect(parsed).toEqual({ book: detail });
    expect(Object.keys(response.body.book)).toEqual([
      "id",
      "title",
      "subtitle",
      "author",
      "synopsis",
      "isbn",
      "publicationYear",
      "pageCount",
      "language",
      "rating",
      "coverSeed",
      "genres",
    ]);
  });
});

describe("GET /api/genres", () => {
  it("returns a response validated by the exact active-genres contract", async () => {
    const response = await request(createApp(testDatabase(), config))
      .get("/api/genres")
      .set("Cookie", sessionCookie())
      .expect(200);

    expect(genresResponseSchema.parse(response.body)).toEqual({ genres: [genre] });
    expect(Object.keys(response.body.genres[0])).toEqual(["id", "name", "slug"]);
  });
});
