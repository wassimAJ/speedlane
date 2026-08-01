import {
  adminBookResponseSchema,
  adminBooksResponseSchema,
  adminErrorResponseSchema,
  adminGenreResponseSchema,
  adminGenresResponseSchema,
  apiErrorResponseSchema,
  type AdminBook,
  type AdminBookInput,
  type AdminGenre,
  type AuthenticatedUser,
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

const genre: AdminGenre = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Science Fiction",
  slug: "science-fiction",
  archivedAt: null,
};

const bookInput: AdminBookInput = {
  title: "The Quiet Orbit",
  subtitle: "Notes from the outer shelf",
  author: "Avery Stone",
  synopsis: "A long-form librarian-managed synopsis.",
  isbn: "9780306406157",
  publicationYear: 2024,
  pageCount: 336,
  language: "English",
  rating: 4.5,
  coverSeed: "quiet-orbit",
  genreIds: [genre.id],
};

const { genreIds: _bookGenreIds, ...bookFields } = bookInput;
const book: AdminBook = {
  id: "10000000-0000-4000-8000-000000000001",
  ...bookFields,
  archivedAt: null,
  genres: [genre],
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
  role: Role = "LIBRARIAN",
  overrides: Partial<AppDatabase> = {},
): AppDatabase {
  const user = authenticatedUser(role);
  const okBook = { kind: "ok" as const, value: book };
  const okGenre = { kind: "ok" as const, value: genre };

  return {
    check: vi.fn().mockResolvedValue(undefined),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn().mockResolvedValue(user),
    findPublicBookPreviews: vi.fn().mockResolvedValue([]),
    findCatalogueBooks: vi.fn().mockResolvedValue({ books: [], totalItems: 0 }),
    findCatalogueBookById: vi.fn().mockResolvedValue(null),
    findActiveGenres: vi.fn().mockResolvedValue([]),
    findFavouriteGenres: vi.fn().mockResolvedValue([]),
    replaceFavouriteGenres: vi.fn().mockResolvedValue([]),
    findForYourShelves: vi.fn().mockResolvedValue([]),
    findReadingList: vi.fn().mockResolvedValue([]),
    upsertReadingListEntry: vi.fn().mockResolvedValue(null),
    removeReadingListEntry: vi.fn().mockResolvedValue(undefined),
    findAdminBooks: vi.fn().mockResolvedValue([book]),
    createAdminBook: vi.fn().mockResolvedValue(okBook),
    updateAdminBook: vi.fn().mockResolvedValue(okBook),
    archiveAdminBook: vi.fn().mockResolvedValue(okBook),
    restoreAdminBook: vi.fn().mockResolvedValue(okBook),
    findAdminGenres: vi.fn().mockResolvedValue([genre]),
    createAdminGenre: vi.fn().mockResolvedValue(okGenre),
    updateAdminGenre: vi.fn().mockResolvedValue(okGenre),
    archiveAdminGenre: vi.fn().mockResolvedValue(okGenre),
    restoreAdminGenre: vi.fn().mockResolvedValue(okGenre),
    ...overrides,
  };
}

function sessionCookie(role: Role) {
  const token = createSessionToken(authenticatedUser(role).id, {
    secret: config.jwtSecret,
    ttlSeconds: config.sessionTtlSeconds,
  });

  return `${SESSION_COOKIE_NAME}=${token}`;
}

const adminRequests = [
  {
    name: "list books",
    status: 200,
    perform: (app: Express, cookie?: string) => {
      const call = request(app).get("/api/admin/books?status=active");
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "create book",
    status: 201,
    perform: (app: Express, cookie?: string) => {
      const call = request(app).post("/api/admin/books").send(bookInput);
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "update book",
    status: 200,
    perform: (app: Express, cookie?: string) => {
      const call = request(app).put(`/api/admin/books/${book.id}`).send(bookInput);
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "archive book",
    status: 200,
    perform: (app: Express, cookie?: string) => {
      const call = request(app).delete(`/api/admin/books/${book.id}`);
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "restore book",
    status: 200,
    perform: (app: Express, cookie?: string) => {
      const call = request(app).post(`/api/admin/books/${book.id}/restore`);
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "list genres",
    status: 200,
    perform: (app: Express, cookie?: string) => {
      const call = request(app).get("/api/admin/genres?status=active");
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "create genre",
    status: 201,
    perform: (app: Express, cookie?: string) => {
      const call = request(app).post("/api/admin/genres").send({
        name: genre.name,
        slug: genre.slug,
      });
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "update genre",
    status: 200,
    perform: (app: Express, cookie?: string) => {
      const call = request(app).put(`/api/admin/genres/${genre.id}`).send({
        name: genre.name,
        slug: genre.slug,
      });
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "archive genre",
    status: 200,
    perform: (app: Express, cookie?: string) => {
      const call = request(app).delete(`/api/admin/genres/${genre.id}`);
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
  {
    name: "restore genre",
    status: 200,
    perform: (app: Express, cookie?: string) => {
      const call = request(app).post(`/api/admin/genres/${genre.id}/restore`);
      return cookie === undefined ? call : call.set("Cookie", cookie);
    },
  },
];

describe("admin authorization and success contracts", () => {
  it.each(adminRequests)("rejects anonymous access to $name", async ({ perform }) => {
    const response = await perform(createApp(testDatabase(), config)).expect(401);

    expect(adminErrorResponseSchema.parse(response.body)).toEqual({
      error: "Authentication is required.",
    });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });

  it.each(adminRequests)("rejects reader access to $name", async ({ perform }) => {
    const response = await perform(
      createApp(testDatabase("READER"), config),
      sessionCookie("READER"),
    ).expect(403);

    expect(adminErrorResponseSchema.parse(response.body)).toEqual({
      error: "You do not have permission to do that.",
    });
  });

  it.each(adminRequests)(
    "allows librarian to $name",
    async ({ perform, status }) => {
      const response = await perform(
        createApp(testDatabase(), config),
        sessionCookie("LIBRARIAN"),
      ).expect(status);

      expect(response.headers["cache-control"]).toBe("private, no-store");
    },
  );

  it("returns list and resource payloads matching the shared schemas", async () => {
    const app = createApp(testDatabase(), config);
    const cookie = sessionCookie("LIBRARIAN");

    const books = await request(app)
      .get("/api/admin/books?status=active")
      .set("Cookie", cookie);
    const genres = await request(app)
      .get("/api/admin/genres?status=active")
      .set("Cookie", cookie);
    const createdBook = await request(app)
      .post("/api/admin/books")
      .set("Cookie", cookie)
      .send(bookInput);
    const createdGenre = await request(app)
      .post("/api/admin/genres")
      .set("Cookie", cookie)
      .send({ name: genre.name, slug: genre.slug });

    expect(adminBooksResponseSchema.parse(books.body)).toEqual({ books: [book] });
    expect(adminGenresResponseSchema.parse(genres.body)).toEqual({
      genres: [genre],
    });
    expect(adminBookResponseSchema.parse(createdBook.body)).toEqual({ book });
    expect(adminGenreResponseSchema.parse(createdGenre.body)).toEqual({ genre });
  });
});

describe("admin flat error isolation and validation", () => {
  it("returns a flat malformed-JSON error only for admin routes", async () => {
    const response = await request(createApp(testDatabase(), config))
      .post("/api/admin/books")
      .set("Cookie", sessionCookie("LIBRARIAN"))
      .set("Content-Type", "application/json")
      .send('{"title":')
      .expect(400);

    expect(response.body).toEqual({ error: "Request body must be valid JSON." });

    const existing = await request(createApp(testDatabase(), config))
      .get("/api/books")
      .expect(401);
    expect(apiErrorResponseSchema.parse(existing.body).error.code).toBe(
      "UNAUTHENTICATED",
    );
  });

  it("returns a safe flat 413 for an oversized admin JSON body", async () => {
    const database = testDatabase();
    const response = await request(createApp(database, config))
      .post("/api/admin/books")
      .set("Cookie", sessionCookie("LIBRARIAN"))
      .send({
        ...bookInput,
        padding: "x".repeat(1_048_576),
      })
      .expect(413);

    expect(response.body).toEqual({ error: "Request body is too large." });
    expect(response.headers["cache-control"]).toBe("private, no-store");
    expect(database.createAdminBook).not.toHaveBeenCalled();
  });

  it("returns a flat not-found error for an unknown admin route", async () => {
    const response = await request(createApp(testDatabase(), config))
      .get("/api/admin/unknown?source=test")
      .set("Cookie", sessionCookie("LIBRARIAN"))
      .expect(404);

    expect(response.body).toEqual({ error: "Admin route not found." });
  });

  it.each([
    ["missing status", "/api/admin/books"],
    ["unknown status", "/api/admin/books?status=deleted"],
    ["unknown query field", "/api/admin/genres?status=active&extra=true"],
    ["repeated status", "/api/admin/genres?status=active&status=archived"],
  ])("rejects %s with a flat query error", async (_case, path) => {
    const response = await request(createApp(testDatabase(), config))
      .get(path)
      .set("Cookie", sessionCookie("LIBRARIAN"))
      .expect(400);

    expect(response.body).toEqual({ error: "Admin status query is invalid." });
  });

  it.each([
    ["book", "/api/admin/books/not-a-uuid"],
    ["genre", "/api/admin/genres/not-a-uuid"],
  ])("rejects an invalid %s identifier", async (_kind, path) => {
    const response = await request(createApp(testDatabase(), config))
      .delete(path)
      .set("Cookie", sessionCookie("LIBRARIAN"))
      .expect(400);

    expect(adminErrorResponseSchema.parse(response.body).error).toMatch(
      /identifier is invalid/,
    );
  });

  it("strictly validates book and genre bodies before store execution", async () => {
    const database = testDatabase();
    const app = createApp(database, config);
    const cookie = sessionCookie("LIBRARIAN");

    const invalidBook = await request(app)
      .post("/api/admin/books")
      .set("Cookie", cookie)
      .send({ ...bookInput, extra: true })
      .expect(400);
    const invalidGenre = await request(app)
      .post("/api/admin/genres")
      .set("Cookie", cookie)
      .send({ name: "", slug: "BAD SLUG" })
      .expect(400);

    expect(invalidBook.body).toEqual({ error: "Book input is invalid." });
    expect(invalidGenre.body).toEqual({ error: "Genre input is invalid." });
    expect(database.createAdminBook).not.toHaveBeenCalled();
    expect(database.createAdminGenre).not.toHaveBeenCalled();
  });

  it("normalizes trimmed inputs and ISBN before store execution", async () => {
    const database = testDatabase();

    await request(createApp(database, config))
      .post("/api/admin/books")
      .set("Cookie", sessionCookie("LIBRARIAN"))
      .send({
        ...bookInput,
        title: `  ${bookInput.title}  `,
        isbn: "978-0-306-40615-7",
      })
      .expect(201);

    expect(database.createAdminBook).toHaveBeenCalledWith({
      ...bookInput,
      title: bookInput.title,
      isbn: "9780306406157",
    });
  });
});

describe("admin business error mapping", () => {
  it.each([
    [
      "book not found",
      { updateAdminBook: vi.fn().mockResolvedValue({ kind: "not_found" }) },
      "put",
      `/api/admin/books/${book.id}`,
      bookInput,
      404,
      "Book not found.",
    ],
    [
      "invalid selected genres",
      { createAdminBook: vi.fn().mockResolvedValue({ kind: "invalid_genres" }) },
      "post",
      "/api/admin/books",
      bookInput,
      400,
      "Selected genres must all exist and be active.",
    ],
    [
      "ISBN conflict",
      { createAdminBook: vi.fn().mockResolvedValue({ kind: "isbn_conflict" }) },
      "post",
      "/api/admin/books",
      bookInput,
      409,
      "A book with this ISBN already exists.",
    ],
    [
      "book restore without active genre",
      { restoreAdminBook: vi.fn().mockResolvedValue({ kind: "no_active_genre" }) },
      "post",
      `/api/admin/books/${book.id}/restore`,
      undefined,
      409,
      "Book must have an active associated genre before it can be restored.",
    ],
    [
      "genre conflict",
      { createAdminGenre: vi.fn().mockResolvedValue({ kind: "genre_conflict" }) },
      "post",
      "/api/admin/genres",
      { name: genre.name, slug: genre.slug },
      409,
      "An active genre with this name or slug already exists.",
    ],
    [
      "genre not found",
      { updateAdminGenre: vi.fn().mockResolvedValue({ kind: "not_found" }) },
      "put",
      `/api/admin/genres/${genre.id}`,
      { name: genre.name, slug: genre.slug },
      404,
      "Genre not found.",
    ],
    [
      "sole-active-genre guard",
      { archiveAdminGenre: vi.fn().mockResolvedValue({ kind: "sole_active_genre" }) },
      "delete",
      `/api/admin/genres/${genre.id}`,
      undefined,
      409,
      "Genre is the only active genre for one or more active books.",
    ],
  ] as const)(
    "returns the flat error for %s",
    async (_case, overrides, method, path, body, status, error) => {
      const app = createApp(testDatabase("LIBRARIAN", overrides), config);
      let call = request(app)[method](path).set(
        "Cookie",
        sessionCookie("LIBRARIAN"),
      );

      if (body !== undefined) {
        call = call.send(body);
      }

      const response = await call.expect(status);
      expect(response.body).toEqual({ error });
    },
  );
});
