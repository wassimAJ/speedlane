import { Prisma, type PrismaClient } from "@prisma/client";
import {
  adminBookSchema,
  adminGenreSchema,
  type AdminBookInput,
} from "@amazon-2/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  archiveAdminBook,
  archiveAdminGenre,
  createAdminBook,
  createAdminGenre,
  findAdminBooks,
  findAdminGenres,
  restoreAdminBook,
  restoreAdminGenre,
  updateAdminBook,
  updateAdminGenre,
} from "./database.js";

const genre = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Science Fiction",
  slug: "science-fiction",
  archivedAt: null,
};
const secondGenre = {
  id: "20000000-0000-4000-8000-000000000002",
  name: "Fantasy",
  slug: "fantasy",
  archivedAt: null,
};
const archivedGenre = {
  ...genre,
  archivedAt: new Date("2026-01-01T00:00:00.000Z"),
};
const archivedHistoricalGenre = {
  id: "20000000-0000-4000-8000-000000000003",
  name: "Classics",
  slug: "classics",
  archivedAt: new Date("2025-01-01T00:00:00.000Z"),
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
const bookId = "10000000-0000-4000-8000-000000000001";

function bookRow(archived = false, genres = [{ genre }]) {
  const { genreIds: _genreIds, ...fields } = bookInput;

  return {
    id: bookId,
    ...fields,
    archivedAt: archived ? new Date("2026-01-01T00:00:00.000Z") : null,
    genres,
  };
}

function prismaMock() {
  const bookFindMany = vi.fn().mockResolvedValue([bookRow()]);
  const bookFindUnique = vi.fn().mockResolvedValue(bookRow());
  const bookFindFirst = vi.fn().mockResolvedValue(null);
  const bookCreate = vi.fn().mockResolvedValue(bookRow());
  const bookUpdate = vi.fn().mockResolvedValue(bookRow());
  const bookCount = vi.fn().mockResolvedValue(0);
  const genreFindMany = vi.fn().mockResolvedValue([genre]);
  const genreFindUnique = vi.fn().mockResolvedValue(genre);
  const genreFindFirst = vi.fn().mockResolvedValue(null);
  const genreCreate = vi.fn().mockResolvedValue(genre);
  const genreUpdate = vi.fn().mockResolvedValue(genre);
  const genreCount = vi.fn().mockResolvedValue(1);
  const bookGenreDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const bookGenreCreateMany = vi.fn().mockResolvedValue({ count: 1 });
  const bookGenreCount = vi.fn().mockResolvedValue(1);
  const transactionClient = {
    book: {
      findMany: bookFindMany,
      findUnique: bookFindUnique,
      findFirst: bookFindFirst,
      create: bookCreate,
      update: bookUpdate,
      count: bookCount,
    },
    genre: {
      findMany: genreFindMany,
      findUnique: genreFindUnique,
      findFirst: genreFindFirst,
      create: genreCreate,
      update: genreUpdate,
      count: genreCount,
    },
    bookGenre: {
      deleteMany: bookGenreDeleteMany,
      createMany: bookGenreCreateMany,
      count: bookGenreCount,
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
    bookFindMany,
    bookFindUnique,
    bookFindFirst,
    bookCreate,
    bookUpdate,
    bookCount,
    genreFindMany,
    genreFindUnique,
    genreFindFirst,
    genreCreate,
    genreUpdate,
    genreCount,
    bookGenreDeleteMany,
    bookGenreCreateMany,
    bookGenreCount,
  };
}

describe("admin book persistence", () => {
  it.each([
    ["active", { archivedAt: null }],
    ["archived", { archivedAt: { not: null } }],
  ] as const)("lists %s books in stable newest order", async (status, where) => {
    const database = prismaMock();

    const result = await findAdminBooks(database.prisma, status);

    expect(database.bookFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      }),
    );
    expect(result.map((book) => adminBookSchema.parse(book))).toHaveLength(1);
  });

  it("creates a book and its active associations atomically", async () => {
    const database = prismaMock();
    database.bookFindUnique.mockResolvedValueOnce(null);

    const result = await createAdminBook(database.prisma, bookInput);

    expect(database.genreCount).toHaveBeenCalledWith({
      where: { id: { in: bookInput.genreIds }, archivedAt: null },
    });
    expect(database.bookFindUnique).toHaveBeenCalledWith({
      where: { isbn: bookInput.isbn },
      select: { id: true },
    });
    expect(database.bookCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          isbn: bookInput.isbn,
          genres: {
            create: [{ genreId: genre.id }],
          },
        }),
      }),
    );
    expect(result.kind).toBe("ok");
    expect(database.transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: "Serializable",
    });
  });

  it("rejects inactive or unknown selected genres before book mutation", async () => {
    const database = prismaMock();
    database.genreCount.mockResolvedValue(0);

    await expect(createAdminBook(database.prisma, bookInput)).resolves.toEqual({
      kind: "invalid_genres",
    });
    expect(database.bookFindUnique).not.toHaveBeenCalled();
    expect(database.bookCreate).not.toHaveBeenCalled();
  });

  it("rejects a globally duplicated ISBN before create", async () => {
    const database = prismaMock();
    database.bookFindUnique.mockResolvedValue({ id: bookId });

    await expect(createAdminBook(database.prisma, bookInput)).resolves.toEqual({
      kind: "isbn_conflict",
    });
    expect(database.bookCreate).not.toHaveBeenCalled();
  });

  it("preserves archived genre associations during an unrelated field edit", async () => {
    const database = prismaMock();
    const input = { ...bookInput, title: "The Renamed Orbit" };
    database.bookFindUnique
      .mockResolvedValueOnce({ id: bookId })
      .mockResolvedValueOnce(
        bookRow(false, [
          { genre: archivedHistoricalGenre },
          { genre },
        ]),
      );

    const result = await updateAdminBook(database.prisma, bookId, input);

    expect(database.bookGenreDeleteMany).toHaveBeenCalledWith({
      where: {
        bookId,
        genre: { archivedAt: null },
      },
    });
    expect(database.bookGenreCreateMany).toHaveBeenCalledWith({
      data: [{ bookId, genreId: genre.id }],
    });
    expect(result).toMatchObject({
      kind: "ok",
      value: {
        genres: expect.arrayContaining([
          expect.objectContaining({
            id: archivedHistoricalGenre.id,
            archivedAt: archivedHistoricalGenre.archivedAt.toISOString(),
          }),
          expect.objectContaining({ id: genre.id, archivedAt: null }),
        ]),
      },
    });
  });

  it("atomically replaces active associations without touching archived joins", async () => {
    const database = prismaMock();
    const input = { ...bookInput, genreIds: [secondGenre.id] };
    database.bookFindUnique
      .mockResolvedValueOnce({ id: bookId })
      .mockResolvedValueOnce(
        bookRow(false, [
          { genre: archivedHistoricalGenre },
          { genre: secondGenre },
        ]),
      );

    const result = await updateAdminBook(database.prisma, bookId, input);

    expect(database.bookFindFirst).toHaveBeenCalledWith({
      where: { isbn: input.isbn, id: { not: bookId } },
      select: { id: true },
    });
    expect(database.bookUpdate).toHaveBeenCalledWith({
      where: { id: bookId },
      data: expect.not.objectContaining({ genreIds: expect.anything() }),
    });
    expect(database.bookGenreDeleteMany).toHaveBeenCalledWith({
      where: {
        bookId,
        genre: { archivedAt: null },
      },
    });
    expect(database.bookGenreCreateMany).toHaveBeenCalledWith({
      data: [{ bookId, genreId: secondGenre.id }],
    });
    expect(result).toMatchObject({
      kind: "ok",
      value: {
        genres: expect.arrayContaining([
          expect.objectContaining({ id: archivedHistoricalGenre.id }),
          expect.objectContaining({ id: secondGenre.id, archivedAt: null }),
        ]),
      },
    });
  });

  it("archives without removing associations and treats repeated archive as success", async () => {
    const database = prismaMock();

    const result = await archiveAdminBook(database.prisma, bookId);

    expect(result.kind).toBe("ok");
    expect(database.bookUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: expect.any(Date) } }),
    );
    expect(database.bookGenreDeleteMany).not.toHaveBeenCalled();

    const repeated = prismaMock();
    repeated.bookFindUnique.mockResolvedValue(bookRow(true));
    await expect(archiveAdminBook(repeated.prisma, bookId)).resolves.toMatchObject({
      kind: "ok",
    });
    expect(repeated.bookUpdate).not.toHaveBeenCalled();
  });

  it("blocks restore without an active association and preserves associations", async () => {
    const database = prismaMock();
    database.bookFindUnique.mockResolvedValue(bookRow(true));
    database.bookGenreCount.mockResolvedValue(0);

    await expect(restoreAdminBook(database.prisma, bookId)).resolves.toEqual({
      kind: "no_active_genre",
    });
    expect(database.bookUpdate).not.toHaveBeenCalled();
    expect(database.bookGenreDeleteMany).not.toHaveBeenCalled();
  });

  it("restores with an active association and treats repeated restore as success", async () => {
    const database = prismaMock();
    database.bookFindUnique.mockResolvedValue(bookRow(true));

    await expect(restoreAdminBook(database.prisma, bookId)).resolves.toMatchObject({
      kind: "ok",
    });
    expect(database.bookUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: null } }),
    );
    expect(database.bookGenreDeleteMany).not.toHaveBeenCalled();

    const repeated = prismaMock();
    await expect(restoreAdminBook(repeated.prisma, bookId)).resolves.toMatchObject({
      kind: "ok",
    });
    expect(repeated.bookUpdate).not.toHaveBeenCalled();
  });
});

describe("admin genre persistence", () => {
  it.each([
    ["active", { archivedAt: null }],
    ["archived", { archivedAt: { not: null } }],
  ] as const)("lists %s genres in stable name order", async (status, where) => {
    const database = prismaMock();

    const result = await findAdminGenres(database.prisma, status);

    expect(database.genreFindMany).toHaveBeenCalledWith({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: expect.any(Object),
    });
    expect(result.map((genre) => adminGenreSchema.parse(genre))).toHaveLength(1);
  });

  it("checks active name and slug conflicts case-insensitively before create", async () => {
    const database = prismaMock();
    database.genreFindFirst.mockResolvedValue({ id: secondGenre.id });

    await expect(
      createAdminGenre(database.prisma, {
        name: "SCIENCE FICTION",
        slug: "science-fiction",
      }),
    ).resolves.toEqual({ kind: "genre_conflict" });
    expect(database.genreFindFirst).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        OR: [
          { name: { equals: "SCIENCE FICTION", mode: "insensitive" } },
          { slug: { equals: "science-fiction", mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });
    expect(database.genreCreate).not.toHaveBeenCalled();
  });

  it("creates a unique active genre atomically", async () => {
    const database = prismaMock();
    database.genreCreate.mockResolvedValue(secondGenre);

    const result = await createAdminGenre(database.prisma, {
      name: secondGenre.name,
      slug: secondGenre.slug,
    });

    expect(result).toMatchObject({ kind: "ok" });
    expect(database.genreCreate).toHaveBeenCalledWith({
      data: { name: secondGenre.name, slug: secondGenre.slug },
      select: expect.any(Object),
    });
  });

  it("allows an archived genre to duplicate an active value until restore", async () => {
    const database = prismaMock();
    database.genreFindUnique.mockResolvedValue(archivedGenre);
    database.genreUpdate.mockResolvedValue({
      ...archivedGenre,
      name: secondGenre.name,
      slug: secondGenre.slug,
    });

    await expect(
      updateAdminGenre(database.prisma, genre.id, {
        name: secondGenre.name,
        slug: secondGenre.slug,
      }),
    ).resolves.toMatchObject({ kind: "ok" });
    expect(database.genreFindFirst).not.toHaveBeenCalled();
  });

  it("guards sole-active-genre archive without changing associations", async () => {
    const database = prismaMock();
    database.bookCount.mockResolvedValue(1);

    await expect(archiveAdminGenre(database.prisma, genre.id)).resolves.toEqual({
      kind: "sole_active_genre",
    });
    expect(database.bookCount).toHaveBeenCalledWith({
      where: {
        archivedAt: null,
        genres: { some: { genreId: genre.id } },
        NOT: {
          genres: {
            some: {
              genreId: { not: genre.id },
              genre: { archivedAt: null },
            },
          },
        },
      },
    });
    expect(database.genreUpdate).not.toHaveBeenCalled();
    expect(database.bookGenreDeleteMany).not.toHaveBeenCalled();
  });

  it("archives by timestamp only when another active genre protects every book", async () => {
    const database = prismaMock();

    await expect(archiveAdminGenre(database.prisma, genre.id)).resolves.toMatchObject({
      kind: "ok",
    });
    expect(database.genreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: expect.any(Date) } }),
    );
    expect(database.bookGenreDeleteMany).not.toHaveBeenCalled();
  });

  it("rejects restore when an archived duplicate conflicts with an active genre", async () => {
    const database = prismaMock();
    database.genreFindUnique.mockResolvedValue(archivedGenre);
    database.genreFindFirst.mockResolvedValue({ id: secondGenre.id });

    await expect(restoreAdminGenre(database.prisma, genre.id)).resolves.toEqual({
      kind: "genre_conflict",
    });
    expect(database.genreUpdate).not.toHaveBeenCalled();
  });

  it("restores a unique archived genre and treats repeated restore as success", async () => {
    const database = prismaMock();
    database.genreFindUnique.mockResolvedValue(archivedGenre);

    await expect(restoreAdminGenre(database.prisma, genre.id)).resolves.toMatchObject({
      kind: "ok",
    });
    expect(database.genreUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { archivedAt: null } }),
    );

    const repeated = prismaMock();
    await expect(restoreAdminGenre(repeated.prisma, genre.id)).resolves.toMatchObject({
      kind: "ok",
    });
    expect(repeated.genreUpdate).not.toHaveBeenCalled();
  });
});

describe("admin mutation race handling", () => {
  it("translates database ISBN and active-genre uniqueness races", async () => {
    const uniqueError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      {
        code: "P2002",
        clientVersion: "test",
      },
    );
    const bookDatabase = prismaMock();
    bookDatabase.transaction.mockRejectedValue(uniqueError);
    const genreDatabase = prismaMock();
    genreDatabase.transaction.mockRejectedValue(uniqueError);

    await expect(
      createAdminBook(bookDatabase.prisma, bookInput),
    ).resolves.toEqual({ kind: "isbn_conflict" });
    await expect(
      createAdminGenre(genreDatabase.prisma, {
        name: secondGenre.name,
        slug: secondGenre.slug,
      }),
    ).resolves.toEqual({ kind: "genre_conflict" });
  });

  it("retries a serializable write conflict before succeeding", async () => {
    const serializationError = new Prisma.PrismaClientKnownRequestError(
      "Transaction write conflict",
      {
        code: "P2034",
        clientVersion: "test",
      },
    );
    const database = prismaMock();
    database.transaction.mockRejectedValueOnce(serializationError);
    database.genreCreate.mockResolvedValue(secondGenre);

    await expect(
      createAdminGenre(database.prisma, {
        name: secondGenre.name,
        slug: secondGenre.slug,
      }),
    ).resolves.toMatchObject({ kind: "ok" });
    expect(database.transaction).toHaveBeenCalledTimes(2);
  });
});
