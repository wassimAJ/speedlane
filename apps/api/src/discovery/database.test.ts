import type { PrismaClient } from "@prisma/client";
import { discoveryResponseSchema } from "@amazon-2/contracts";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp, type AppConfig, type AppDatabase } from "../app.js";
import { findPublicBookPreviews } from "./database.js";

const config: AppConfig = {
  corsOrigin: "http://localhost:5173",
  jwtSecret: "test-only-secret-with-more-than-thirty-two-characters",
  sessionTtlSeconds: 900,
  secureCookie: false,
};

const previewRows = Array.from({ length: 8 }, (_, index) => ({
  coverSeed: `cover-${index + 1}`,
  title: `Book ${index + 1}`,
  author: `Author ${index + 1}`,
  genres: ["Fiction"],
}));

function testDatabase(overrides: Partial<AppDatabase> = {}): AppDatabase {
  return {
    check: vi.fn().mockResolvedValue(undefined),
    findUserByEmail: vi.fn().mockResolvedValue(null),
    findUserById: vi.fn().mockResolvedValue(null),
    findCatalogueBooks: vi.fn().mockResolvedValue({ books: [], totalItems: 0 }),
    findCatalogueBookById: vi.fn().mockResolvedValue(null),
    findActiveGenres: vi.fn().mockResolvedValue([]),
    findPublicBookPreviews: vi.fn().mockResolvedValue(previewRows),
    ...overrides,
  };
}

describe("GET /api/discover", () => {
  it("allows unauthenticated public access and returns at most six previews", async () => {
    const database = testDatabase();
    const response = await request(createApp(database, config)).get("/api/discover").expect(200);

    expect(response.body.books).toHaveLength(6);
    expect(database.findUserById).not.toHaveBeenCalled();
    expect(database.findPublicBookPreviews).toHaveBeenCalledOnce();
  });

  it("returns a response validated by the strict shared discovery contract", async () => {
    const response = await request(createApp(testDatabase(), config))
      .get("/api/discover")
      .expect(200);
    const parsed = discoveryResponseSchema.parse(response.body);

    expect(parsed).toEqual({ books: previewRows.slice(0, 6) });
    expect(Object.keys(response.body.books[0])).toEqual([
      "coverSeed",
      "title",
      "author",
      "genres",
    ]);
  });
});

describe("public discovery database query", () => {
  it("selects only active books in newest-first order with an ID tie-breaker", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        coverSeed: "cover-newer-a",
        title: "Newer A",
        author: "Author A",
        genres: [{ genre: { name: "Fantasy" } }, { genre: { name: "Science Fiction" } }],
      },
      {
        coverSeed: "cover-newer-b",
        title: "Newer B",
        author: "Author B",
        genres: [{ genre: { name: "Mystery" } }],
      },
    ]);
    const prisma = { book: { findMany } } as unknown as PrismaClient;

    const previews = await findPublicBookPreviews(prisma);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { archivedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 6,
      }),
    );
    expect(previews).toEqual([
      {
        coverSeed: "cover-newer-a",
        title: "Newer A",
        author: "Author A",
        genres: ["Fantasy", "Science Fiction"],
      },
      {
        coverSeed: "cover-newer-b",
        title: "Newer B",
        author: "Author B",
        genres: ["Mystery"],
      },
    ]);
  });

  it("excludes archived genres and selects no book-internal fields", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { book: { findMany } } as unknown as PrismaClient;

    await findPublicBookPreviews(prisma);

    expect(findMany).toHaveBeenCalledWith({
      where: { archivedAt: null },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: 6,
      select: {
        coverSeed: true,
        title: true,
        author: true,
        genres: {
          where: { genre: { archivedAt: null } },
          orderBy: [{ genre: { name: "asc" } }, { genreId: "asc" }],
          select: { genre: { select: { name: true } } },
        },
      },
    });
  });
});
