import {
  catalogueBookNotFoundErrorResponseSchema,
  catalogueInvalidBookIdErrorResponseSchema,
  catalogueUnauthenticatedErrorResponseSchema,
  favouriteGenresInvalidInputErrorResponseSchema,
  favouriteGenresResponseSchema,
  forYourShelvesResponseSchema,
  readingListEntryResponseSchema,
  readingListInvalidInputErrorResponseSchema,
  readingListResponseSchema,
  type AuthenticatedUser,
  type CatalogueBookSummary,
  type GenreSummary,
  type ReadingListEntry,
  type Role,
} from "@amazon-2/contracts";
import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp, type AppConfig, type AppDatabase } from "../app.js";
import { SESSION_COOKIE_NAME } from "../auth/cookie.js";
import { createSessionToken } from "../auth/token.js";

const config: AppConfig = {
  corsOrigin: "http://localhost:5173",
  jwtSecret: "test-only-secret-with-more-than-thirty-two-characters",
  sessionTtlSeconds: 900,
  secureCookie: false,
};

const genres: GenreSummary[] = Array.from({ length: 5 }, (_, index) => ({
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name: `Genre ${index + 1}`,
  slug: `genre-${index + 1}`,
}));
const alphabeticGenre: GenreSummary = {
  id: "2abcdef0-1234-4abc-8def-1234567890ab",
  name: "Alphabetic Genre",
  slug: "alphabetic-genre",
};

const book: CatalogueBookSummary = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "The Quiet Orbit",
  author: "Avery Stone",
  publicationYear: 2024,
  rating: 4.8,
  coverSeed: "quiet-orbit",
  genres: [genres[0]!],
};

const availableEntry: ReadingListEntry = {
  status: "WANT_TO_READ",
  book: {
    ...book,
    availability: "AVAILABLE",
  },
};

const unavailableEntry: ReadingListEntry = {
  status: "FINISHED",
  book: {
    availability: "UNAVAILABLE",
    id: "10000000-0000-4000-8000-000000000002",
    title: "An Archived Volume",
    author: "Morgan Reed",
    coverSeed: "archived-volume",
  },
};

function authenticatedUser(role: Role): AuthenticatedUser {
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
    findCatalogueBooks: vi.fn().mockResolvedValue({ books: [], totalItems: 0 }),
    findCatalogueBookById: vi.fn().mockResolvedValue(null),
    findActiveGenres: vi.fn().mockResolvedValue([]),
    findFavouriteGenres: vi.fn().mockResolvedValue(genres),
    replaceFavouriteGenres: vi.fn().mockResolvedValue(genres),
    findForYourShelves: vi.fn().mockResolvedValue([book]),
    findReadingList: vi.fn().mockResolvedValue([
      availableEntry,
      unavailableEntry,
    ]),
    upsertReadingListEntry: vi.fn().mockResolvedValue(availableEntry),
    removeReadingListEntry: vi.fn().mockResolvedValue(undefined),
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

const engagementRequests = [
  {
    name: "GET favourite genres",
    perform: (app: Express, cookie?: string) => {
      const call = request(app).get("/api/me/favourite-genres");
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "PUT favourite genres",
    perform: (app: Express, cookie?: string) => {
      const call = request(app).put("/api/me/favourite-genres").send({
        genreIds: [],
      });
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "GET personalisation",
    perform: (app: Express, cookie?: string) => {
      const call = request(app).get("/api/me/for-your-shelves");
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "GET reading list",
    perform: (app: Express, cookie?: string) => {
      const call = request(app).get("/api/me/reading-list");
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "PUT reading-list entry",
    perform: (app: Express, cookie?: string) => {
      const call = request(app).put(`/api/me/reading-list/${book.id}`).send({});
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "DELETE reading-list entry",
    perform: (app: Express, cookie?: string) => {
      const call = request(app).delete(`/api/me/reading-list/${book.id}`);
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
];

describe("engagement route authorization", () => {
  it.each(engagementRequests)("protects $name", async ({ perform }) => {
    const database = testDatabase();
    const response = await perform(createApp(database, config)).expect(401);

    expect(catalogueUnauthenticatedErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      },
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it.each(["READER", "LIBRARIAN"] as const)(
    "allows a %s to use every engagement route",
    async (role) => {
      const database = testDatabase(role, {
        replaceFavouriteGenres: vi.fn().mockResolvedValue([]),
      });
      const app = createApp(database, config);
      const cookie = sessionCookie(role);

      for (const route of engagementRequests) {
        const response = await route.perform(app, cookie);
        expect(response.status, route.name).toBe(
          route.name.startsWith("DELETE") ? 204 : 200,
        );
        expect(response.headers["cache-control"]).toBe("private, no-store");
      }
    },
  );
});

describe("favourite genres routes", () => {
  it("returns active favourites in store order with an exact response shape", async () => {
    const response = await request(createApp(testDatabase(), config))
      .get("/api/me/favourite-genres")
      .set("Cookie", sessionCookie())
      .expect(200);

    expect(favouriteGenresResponseSchema.parse(response.body)).toEqual({ genres });
    expect(Object.keys(response.body.genres[0])).toEqual(["id", "name", "slug"]);
  });

  it.each([
    ["zero", []],
    ["five", genres.map((genre) => genre.id)],
  ])("accepts %s selected genres and preserves input order", async (_case, ids) => {
    const selected = ids.map((id) => genres.find((genre) => genre.id === id)!);
    const database = testDatabase("READER", {
      replaceFavouriteGenres: vi.fn().mockResolvedValue(selected),
    });
    const response = await request(createApp(database, config))
      .put("/api/me/favourite-genres")
      .set("Cookie", sessionCookie())
      .send({ genreIds: ids })
      .expect(200);

    expect(database.replaceFavouriteGenres).toHaveBeenCalledWith(
      authenticatedUser("READER").id,
      ids,
    );
    expect(favouriteGenresResponseSchema.parse(response.body)).toEqual({
      genres: selected,
    });
  });

  it("canonicalizes an uppercase UUID before store execution and returns 200", async () => {
    const database = testDatabase("READER", {
      replaceFavouriteGenres: vi.fn().mockResolvedValue([alphabeticGenre]),
    });
    const response = await request(createApp(database, config))
      .put("/api/me/favourite-genres")
      .set("Cookie", sessionCookie())
      .send({ genreIds: [alphabeticGenre.id.toUpperCase()] })
      .expect(200);

    expect(database.replaceFavouriteGenres).toHaveBeenCalledWith(
      authenticatedUser("READER").id,
      [alphabeticGenre.id],
    );
    expect(favouriteGenresResponseSchema.parse(response.body)).toEqual({
      genres: [alphabeticGenre],
    });
  });

  it.each([
    ["more than five", { genreIds: [...genres.map((genre) => genre.id), book.id] }],
    ["duplicates", { genreIds: [genres[0]!.id, genres[0]!.id] }],
    [
      "uppercase and lowercase forms of the same UUID",
      {
        genreIds: [alphabeticGenre.id, alphabeticGenre.id.toUpperCase()],
      },
    ],
    ["a malformed UUID", { genreIds: ["not-a-uuid"] }],
    ["an unknown field", { genreIds: [], extra: true }],
    ["a missing list", {}],
  ])("rejects %s before store execution", async (_case, body) => {
    const database = testDatabase();
    const response = await request(createApp(database, config))
      .put("/api/me/favourite-genres")
      .set("Cookie", sessionCookie())
      .send(body)
      .expect(400);

    expect(favouriteGenresInvalidInputErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Favourite genre selection is invalid.",
      },
    });
    expect(database.replaceFavouriteGenres).not.toHaveBeenCalled();
  });

  it.each(["missing", "archived"])(
    "rejects a %s genre reported by the transactional store",
    async () => {
      const database = testDatabase("READER", {
        replaceFavouriteGenres: vi.fn().mockResolvedValue(null),
      });
      const response = await request(createApp(database, config))
        .put("/api/me/favourite-genres")
        .set("Cookie", sessionCookie())
        .send({ genreIds: [genres[0]!.id] })
        .expect(400);

      expect(
        favouriteGenresInvalidInputErrorResponseSchema.parse(response.body),
      ).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: "Favourite genre selection is invalid.",
        },
      });
    },
  );
});

describe("personalised shelves route", () => {
  it("returns at most six reader-safe catalogue summaries", async () => {
    const books = Array.from({ length: 6 }, (_, index) => ({
      ...book,
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    }));
    const response = await request(
      createApp(
        testDatabase("READER", {
          findForYourShelves: vi.fn().mockResolvedValue(books),
        }),
        config,
      ),
    )
      .get("/api/me/for-your-shelves")
      .set("Cookie", sessionCookie())
      .expect(200);

    expect(forYourShelvesResponseSchema.parse(response.body)).toEqual({ books });
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
});

describe("reading-list routes", () => {
  it("returns available and archived entries without internal fields", async () => {
    const response = await request(createApp(testDatabase(), config))
      .get("/api/me/reading-list")
      .set("Cookie", sessionCookie())
      .expect(200);

    expect(readingListResponseSchema.parse(response.body)).toEqual({
      entries: [availableEntry, unavailableEntry],
    });
    expect(Object.keys(response.body.entries[1].book)).toEqual([
      "availability",
      "id",
      "title",
      "author",
      "coverSeed",
    ]);
  });

  it.each([
    ["an omitted status", {}, undefined],
    ["a supplied status", { status: "READING" }, "READING"],
  ])("upserts with %s", async (_case, body, expectedStatus) => {
    const entry: ReadingListEntry = {
      ...availableEntry,
      status: expectedStatus ?? "WANT_TO_READ",
    };
    const database = testDatabase("READER", {
      upsertReadingListEntry: vi.fn().mockResolvedValue(entry),
    });
    const response = await request(createApp(database, config))
      .put(`/api/me/reading-list/${book.id}`)
      .set("Cookie", sessionCookie())
      .send(body)
      .expect(200);

    expect(database.upsertReadingListEntry).toHaveBeenCalledWith(
      authenticatedUser("READER").id,
      book.id,
      expectedStatus,
    );
    expect(readingListEntryResponseSchema.parse(response.body)).toEqual({ entry });
  });

  it.each([
    ["an invalid status", { status: "PAUSED" }],
    ["a null status", { status: null }],
    ["an unknown field", { extra: true }],
  ])("rejects %s before store execution", async (_case, body) => {
    const database = testDatabase();
    const response = await request(createApp(database, config))
      .put(`/api/me/reading-list/${book.id}`)
      .set("Cookie", sessionCookie())
      .send(body)
      .expect(400);

    expect(readingListInvalidInputErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Reading-list update is invalid.",
      },
    });
    expect(database.upsertReadingListEntry).not.toHaveBeenCalled();
  });

  it.each(["put", "delete"] as const)(
    "rejects an invalid book ID on %s",
    async (method) => {
      const database = testDatabase();
      const call = request(createApp(database, config))[method](
        "/api/me/reading-list/not-a-uuid",
      ).set("Cookie", sessionCookie());
      const response =
        method === "put" ? await call.send({}).expect(400) : await call.expect(400);

      expect(catalogueInvalidBookIdErrorResponseSchema.parse(response.body)).toEqual({
        error: {
          code: "INVALID_REQUEST",
          message: "Book identifier is invalid.",
        },
      });
      expect(database.upsertReadingListEntry).not.toHaveBeenCalled();
      expect(database.removeReadingListEntry).not.toHaveBeenCalled();
    },
  );

  it("returns book-not-found when an archived book cannot be updated", async () => {
    const database = testDatabase("READER", {
      upsertReadingListEntry: vi.fn().mockResolvedValue(null),
    });
    const response = await request(createApp(database, config))
      .put(`/api/me/reading-list/${unavailableEntry.book.id}`)
      .set("Cookie", sessionCookie())
      .send({ status: "READING" })
      .expect(404);

    expect(catalogueBookNotFoundErrorResponseSchema.parse(response.body)).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Book not found.",
      },
    });
  });

  it("soft-removes archived, missing, and already-removed entries idempotently", async () => {
    const database = testDatabase();

    await request(createApp(database, config))
      .delete(`/api/me/reading-list/${unavailableEntry.book.id}`)
      .set("Cookie", sessionCookie())
      .expect(204);

    expect(database.removeReadingListEntry).toHaveBeenCalledWith(
      authenticatedUser("READER").id,
      unavailableEntry.book.id,
    );
  });
});
