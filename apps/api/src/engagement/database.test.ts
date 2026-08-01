import type { PrismaClient } from "@prisma/client";
import {
  catalogueBookSummarySchema,
  readingListEntrySchema,
} from "@amazon-2/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  findFavouriteGenres,
  findForYourShelves,
  findReadingList,
  removeReadingListEntry,
  replaceFavouriteGenres,
  upsertReadingListEntry,
} from "./database.js";

const userId = "00000000-0000-4000-8000-000000000001";
const genres = Array.from({ length: 5 }, (_, index) => ({
  id: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  name: `Genre ${index + 1}`,
  slug: `genre-${index + 1}`,
}));
const alphabeticGenre = {
  id: "2abcdef0-1234-4abc-8def-1234567890ab",
  name: "Alphabetic Genre",
  slug: "alphabetic-genre",
};

function bookRow(index: number, archived = false) {
  return {
    id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    title: `Book ${index}`,
    author: `Author ${index}`,
    publicationYear: 2020 + index,
    rating: 4.5,
    coverSeed: `cover-${index}`,
    archivedAt: archived ? new Date("2026-01-01T00:00:00.000Z") : null,
    genres: [{ genre: genres[(index - 1) % genres.length]! }],
  };
}

function prismaMock() {
  const genreFindMany = vi.fn().mockResolvedValue(genres);
  const favouriteFindMany = vi.fn().mockResolvedValue([]);
  const favouriteUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
  const favouriteUpsert = vi.fn().mockResolvedValue({});
  const bookFindMany = vi.fn().mockResolvedValue([]);
  const bookFindFirst = vi.fn().mockResolvedValue({ id: bookRow(1).id });
  const readingFindMany = vi.fn().mockResolvedValue([]);
  const readingFindUnique = vi.fn().mockResolvedValue(null);
  const readingUpsert = vi.fn().mockResolvedValue({
    status: "WANT_TO_READ",
    book: bookRow(1),
  });
  const readingUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
  const transactionClient = {
    genre: { findMany: genreFindMany },
    favouriteGenre: {
      findMany: favouriteFindMany,
      updateMany: favouriteUpdateMany,
      upsert: favouriteUpsert,
    },
    book: {
      findMany: bookFindMany,
      findFirst: bookFindFirst,
    },
    readingListEntry: {
      findMany: readingFindMany,
      findUnique: readingFindUnique,
      upsert: readingUpsert,
      updateMany: readingUpdateMany,
    },
  };
  const transaction = vi.fn(
    async (operation: (client: typeof transactionClient) => Promise<unknown>) =>
      operation(transactionClient),
  );
  const prisma = {
    ...transactionClient,
    $transaction: transaction,
  } as unknown as PrismaClient;

  return {
    prisma,
    transaction,
    genreFindMany,
    favouriteFindMany,
    favouriteUpdateMany,
    favouriteUpsert,
    bookFindMany,
    bookFindFirst,
    readingFindMany,
    readingFindUnique,
    readingUpsert,
    readingUpdateMany,
  };
}

describe("favourite genre persistence", () => {
  it("returns only active, visible favourites in stable preference order", async () => {
    const database = prismaMock();
    database.favouriteFindMany.mockResolvedValue([
      { genre: genres[1] },
      { genre: genres[0] },
    ]);

    const result = await findFavouriteGenres(database.prisma, userId);

    expect(database.favouriteFindMany).toHaveBeenCalledWith({
      where: {
        userId,
        removedAt: null,
        genre: { archivedAt: null },
      },
      orderBy: [{ position: "asc" }, { genreId: "asc" }],
      select: {
        genre: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });
    expect(result).toEqual([genres[1], genres[0]]);
  });

  it("accepts an empty replacement and soft-removes every visible preference", async () => {
    const database = prismaMock();

    await expect(
      replaceFavouriteGenres(database.prisma, userId, []),
    ).resolves.toEqual([]);

    expect(database.genreFindMany).not.toHaveBeenCalled();
    expect(database.favouriteUpdateMany).toHaveBeenCalledWith({
      where: {
        userId,
        removedAt: null,
      },
      data: {
        removedAt: expect.any(Date),
      },
    });
    expect(database.favouriteUpsert).not.toHaveBeenCalled();
  });

  it("validates, soft-removes all visible rows, then restores five preferences in one-based order", async () => {
    const database = prismaMock();
    const requestedIds = genres.map((genre) => genre.id);
    database.genreFindMany.mockResolvedValue([...genres].reverse());

    const result = await replaceFavouriteGenres(
      database.prisma,
      userId,
      requestedIds,
    );

    expect(database.genreFindMany).toHaveBeenCalledWith({
      where: {
        id: { in: requestedIds },
        archivedAt: null,
      },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });
    expect(database.favouriteUpdateMany).toHaveBeenCalledWith({
      where: {
        userId,
        removedAt: null,
      },
      data: { removedAt: expect.any(Date) },
    });
    expect(database.genreFindMany.mock.invocationCallOrder[0]).toBeLessThan(
      database.favouriteUpdateMany.mock.invocationCallOrder[0]!,
    );
    expect(database.favouriteUpsert).toHaveBeenCalledTimes(5);

    for (const [index, genreId] of requestedIds.entries()) {
      const position = index + 1;

      expect(database.favouriteUpsert).toHaveBeenNthCalledWith(position, {
        where: { userId_genreId: { userId, genreId } },
        create: { userId, genreId, position },
        update: { position, removedAt: null },
      });
    }

    expect(result).toEqual(genres);
    expect(database.transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: "Serializable",
    });
  });

  it("safely reorders the same selected genres after clearing visible positions", async () => {
    const database = prismaMock();
    const requestedIds = [genres[1]!.id, genres[0]!.id];
    database.genreFindMany.mockResolvedValue([genres[0], genres[1]]);

    await replaceFavouriteGenres(database.prisma, userId, requestedIds);

    expect(database.favouriteUpdateMany).toHaveBeenCalledWith({
      where: { userId, removedAt: null },
      data: { removedAt: expect.any(Date) },
    });
    expect(database.favouriteUpdateMany.mock.invocationCallOrder[0]).toBeLessThan(
      database.favouriteUpsert.mock.invocationCallOrder[0]!,
    );
    expect(database.favouriteUpsert).toHaveBeenNthCalledWith(1, {
      where: {
        userId_genreId: { userId, genreId: requestedIds[0] },
      },
      create: { userId, genreId: requestedIds[0], position: 1 },
      update: { position: 1, removedAt: null },
    });
    expect(database.favouriteUpsert).toHaveBeenNthCalledWith(2, {
      where: {
        userId_genreId: { userId, genreId: requestedIds[1] },
      },
      create: { userId, genreId: requestedIds[1], position: 2 },
      update: { position: 2, removedAt: null },
    });
  });

  it("canonicalizes an uppercase UUID before lookup, persistence, and response mapping", async () => {
    const database = prismaMock();
    const uppercaseId = alphabeticGenre.id.toUpperCase();
    database.genreFindMany.mockResolvedValue([alphabeticGenre]);

    const result = await replaceFavouriteGenres(database.prisma, userId, [
      uppercaseId,
    ]);

    expect(database.genreFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: [alphabeticGenre.id] },
          archivedAt: null,
        },
      }),
    );
    expect(database.favouriteUpsert).toHaveBeenCalledWith({
      where: {
        userId_genreId: { userId, genreId: alphabeticGenre.id },
      },
      create: { userId, genreId: alphabeticGenre.id, position: 1 },
      update: { position: 1, removedAt: null },
    });
    expect(result).toEqual([alphabeticGenre]);
  });

  it.each(["missing", "archived"])(
    "rejects a %s requested genre before any preference mutation",
    async () => {
      const database = prismaMock();
      database.genreFindMany.mockResolvedValue(genres.slice(0, 1));

      await expect(
        replaceFavouriteGenres(database.prisma, userId, [
          genres[0]!.id,
          genres[1]!.id,
        ]),
      ).resolves.toBeNull();
      expect(database.favouriteUpdateMany).not.toHaveBeenCalled();
      expect(database.favouriteUpsert).not.toHaveBeenCalled();
    },
  );
});

describe("personalised shelf persistence", () => {
  it("uses preference/newest/ID order, deduplicates, caps six, and applies visibility rules", async () => {
    const database = prismaMock();
    database.favouriteFindMany.mockResolvedValue([
      { genreId: genres[0]!.id },
      { genreId: genres[1]!.id },
      { genreId: genres[2]!.id },
    ]);
    database.bookFindMany
      .mockResolvedValueOnce([bookRow(1), bookRow(2)])
      .mockResolvedValueOnce([bookRow(3), bookRow(4), bookRow(5), bookRow(6)]);

    const result = await findForYourShelves(database.prisma, userId);

    expect(database.favouriteFindMany).toHaveBeenCalledWith({
      where: {
        userId,
        removedAt: null,
        genre: { archivedAt: null },
      },
      orderBy: [{ position: "asc" }, { genreId: "asc" }],
      select: { genreId: true },
    });
    expect(database.bookFindMany).toHaveBeenCalledTimes(2);
    expect(database.bookFindMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          archivedAt: null,
          genres: {
            some: {
              genreId: genres[0]!.id,
              genre: { archivedAt: null },
            },
          },
          readingList: {
            none: {
              userId,
              removedAt: null,
            },
          },
        }),
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 6,
      }),
    );
    expect(database.bookFindMany.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          id: {
            notIn: [bookRow(1).id, bookRow(2).id],
          },
          readingList: {
            none: {
              userId,
              removedAt: null,
            },
          },
        }),
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 4,
      }),
    );
    expect(result).toHaveLength(6);
    expect(result.map((book) => book.id)).toEqual(
      [1, 2, 3, 4, 5, 6].map((index) => bookRow(index).id),
    );
    expect(result.every((book) => catalogueBookSummarySchema.safeParse(book).success)).toBe(
      true,
    );
  });

  it("returns no books and performs no book query without visible active favourites", async () => {
    const database = prismaMock();

    await expect(findForYourShelves(database.prisma, userId)).resolves.toEqual([]);
    expect(database.bookFindMany).not.toHaveBeenCalled();
  });
});

describe("reading-list persistence", () => {
  it("returns visible entries in deterministic order with safe archive representations", async () => {
    const database = prismaMock();
    database.readingFindMany.mockResolvedValue([
      { status: "READING", book: bookRow(1) },
      { status: "FINISHED", book: bookRow(2, true) },
    ]);

    const result = await findReadingList(database.prisma, userId);

    expect(database.readingFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId, removedAt: null },
        orderBy: [{ updatedAt: "desc" }, { bookId: "asc" }],
      }),
    );
    expect(result.map((entry) => readingListEntrySchema.parse(entry))).toEqual([
      {
        status: "READING",
        book: {
          availability: "AVAILABLE",
          id: bookRow(1).id,
          title: "Book 1",
          author: "Author 1",
          publicationYear: 2021,
          rating: 4.5,
          coverSeed: "cover-1",
          genres: [genres[0]],
        },
      },
      {
        status: "FINISHED",
        book: {
          availability: "UNAVAILABLE",
          id: bookRow(2).id,
          title: "Book 2",
          author: "Author 2",
          coverSeed: "cover-2",
        },
      },
    ]);
    expect(Object.keys(result[1]!.book)).toEqual([
      "availability",
      "id",
      "title",
      "author",
      "coverSeed",
    ]);
  });

  it.each([
    ["creates a missing entry with the default", undefined, null, "WANT_TO_READ"],
    [
      "restores a removed entry's previously saved status",
      undefined,
      { status: "FINISHED", removedAt: new Date("2026-01-01T00:00:00.000Z") },
      "FINISHED",
    ],
    [
      "preserves a visible entry's status when omitted",
      undefined,
      { status: "READING", removedAt: null },
      "READING",
    ],
    [
      "uses a supplied status while restoring an entry",
      "READING",
      { status: "FINISHED", removedAt: new Date("2026-01-01T00:00:00.000Z") },
      "READING",
    ],
  ] as const)("%s", async (_case, requested, existing, expected) => {
    const database = prismaMock();
    database.readingFindUnique.mockResolvedValue(existing);
    database.readingUpsert.mockResolvedValue({
      status: expected,
      book: bookRow(1),
    });

    const result = await upsertReadingListEntry(
      database.prisma,
      userId,
      bookRow(1).id,
      requested,
    );

    expect(database.bookFindFirst).toHaveBeenCalledWith({
      where: { id: bookRow(1).id, archivedAt: null },
      select: { id: true },
    });
    expect(database.readingFindUnique).toHaveBeenCalledWith({
      where: { userId_bookId: { userId, bookId: bookRow(1).id } },
      select: { status: true, removedAt: true },
    });
    expect(database.readingUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_bookId: { userId, bookId: bookRow(1).id } },
        create: { userId, bookId: bookRow(1).id, status: expected },
        update: { status: expected, removedAt: null },
      }),
    );
    expect(result?.status).toBe(expected);
    expect(database.transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: "Serializable",
    });
  });

  it("does not mutate an entry when the book is missing or archived", async () => {
    const database = prismaMock();
    database.bookFindFirst.mockResolvedValue(null);

    await expect(
      upsertReadingListEntry(
        database.prisma,
        userId,
        bookRow(2).id,
        "READING",
      ),
    ).resolves.toBeNull();
    expect(database.readingFindUnique).not.toHaveBeenCalled();
    expect(database.readingUpsert).not.toHaveBeenCalled();
  });

  it("soft-removes only this user's visible entry without checking book availability", async () => {
    const database = prismaMock();

    await removeReadingListEntry(database.prisma, userId, bookRow(2).id);

    expect(database.bookFindFirst).not.toHaveBeenCalled();
    expect(database.readingUpdateMany).toHaveBeenCalledWith({
      where: {
        userId,
        bookId: bookRow(2).id,
        removedAt: null,
      },
      data: {
        removedAt: expect.any(Date),
      },
    });
  });
});
