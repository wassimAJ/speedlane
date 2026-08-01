import { Prisma, type PrismaClient } from "@prisma/client";
import {
  adminBookSchema,
  adminGenreSchema,
  type AdminBook,
  type AdminBookInput,
  type AdminGenre,
  type AdminGenreInput,
  type AdminRecordStatus,
} from "@amazon-2/contracts";

export type AdminMutationResult<T> =
  | { kind: "ok"; value: T }
  | { kind: "not_found" }
  | { kind: "invalid_genres" }
  | { kind: "isbn_conflict" }
  | { kind: "genre_conflict" }
  | { kind: "sole_active_genre" }
  | { kind: "no_active_genre" };

const adminGenreSelection = Prisma.validator<Prisma.GenreSelect>()({
  id: true,
  name: true,
  slug: true,
  archivedAt: true,
});

const adminBookSelection = Prisma.validator<Prisma.BookSelect>()({
  id: true,
  title: true,
  subtitle: true,
  author: true,
  synopsis: true,
  isbn: true,
  publicationYear: true,
  pageCount: true,
  language: true,
  rating: true,
  coverSeed: true,
  archivedAt: true,
  genres: {
    orderBy: [{ genre: { name: "asc" } }, { genreId: "asc" }],
    select: {
      genre: {
        select: adminGenreSelection,
      },
    },
  },
});

type AdminGenreRow = Prisma.GenreGetPayload<{
  select: typeof adminGenreSelection;
}>;

type AdminBookRow = Prisma.BookGetPayload<{
  select: typeof adminBookSelection;
}>;

function adminGenre(row: AdminGenreRow): AdminGenre {
  return adminGenreSchema.parse({
    ...row,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  });
}

function adminBook(row: AdminBookRow): AdminBook {
  return adminBookSchema.parse({
    ...row,
    rating: Number(row.rating),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    genres: row.genres.map(({ genre }) => adminGenre(genre)),
  });
}

function isKnownPrismaError(error: unknown, code: string) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === code
  );
}

async function serializableTransaction<T>(
  prisma: PrismaClient,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error: unknown) {
      if (attempt < 3 && isKnownPrismaError(error, "P2034")) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Serializable transaction retry limit reached.");
}

async function activeGenreIdsAreValid(
  transaction: Prisma.TransactionClient,
  genreIds: string[],
) {
  const activeGenreCount = await transaction.genre.count({
    where: {
      id: { in: genreIds },
      archivedAt: null,
    },
  });

  return activeGenreCount === genreIds.length;
}

async function findAdminBook(
  transaction: Prisma.TransactionClient,
  bookId: string,
) {
  return transaction.book.findUnique({
    where: { id: bookId },
    select: adminBookSelection,
  });
}

export async function findAdminBooks(
  prisma: PrismaClient,
  status: AdminRecordStatus,
): Promise<AdminBook[]> {
  const rows = await prisma.book.findMany({
    where: {
      archivedAt: status === "active" ? null : { not: null },
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    select: adminBookSelection,
  });

  return rows.map((row) => adminBook(row));
}

export async function createAdminBook(
  prisma: PrismaClient,
  input: AdminBookInput,
): Promise<AdminMutationResult<AdminBook>> {
  try {
    return await serializableTransaction(prisma, async (transaction) => {
      if (!(await activeGenreIdsAreValid(transaction, input.genreIds))) {
        return { kind: "invalid_genres" };
      }

      const isbnConflict = await transaction.book.findUnique({
        where: { isbn: input.isbn },
        select: { id: true },
      });

      if (isbnConflict !== null) {
        return { kind: "isbn_conflict" };
      }

      const { genreIds, ...bookInput } = input;
      const created = await transaction.book.create({
        data: {
          ...bookInput,
          genres: {
            create: genreIds.map((genreId) => ({ genreId })),
          },
        },
        select: adminBookSelection,
      });

      return { kind: "ok", value: adminBook(created) };
    });
  } catch (error: unknown) {
    if (isKnownPrismaError(error, "P2002")) {
      return { kind: "isbn_conflict" };
    }

    throw error;
  }
}

export async function updateAdminBook(
  prisma: PrismaClient,
  bookId: string,
  input: AdminBookInput,
): Promise<AdminMutationResult<AdminBook>> {
  try {
    return await serializableTransaction(prisma, async (transaction) => {
      const existing = await transaction.book.findUnique({
        where: { id: bookId },
        select: { id: true },
      });

      if (existing === null) {
        return { kind: "not_found" };
      }

      if (!(await activeGenreIdsAreValid(transaction, input.genreIds))) {
        return { kind: "invalid_genres" };
      }

      const isbnConflict = await transaction.book.findFirst({
        where: {
          isbn: input.isbn,
          id: { not: bookId },
        },
        select: { id: true },
      });

      if (isbnConflict !== null) {
        return { kind: "isbn_conflict" };
      }

      const { genreIds, ...bookInput } = input;

      await transaction.book.update({
        where: { id: bookId },
        data: bookInput,
      });
      await transaction.bookGenre.deleteMany({
        where: {
          bookId,
          genre: { archivedAt: null },
        },
      });
      await transaction.bookGenre.createMany({
        data: genreIds.map((genreId) => ({ bookId, genreId })),
      });

      const updated = await findAdminBook(transaction, bookId);

      if (updated === null) {
        return { kind: "not_found" };
      }

      return { kind: "ok", value: adminBook(updated) };
    });
  } catch (error: unknown) {
    if (isKnownPrismaError(error, "P2002")) {
      return { kind: "isbn_conflict" };
    }

    throw error;
  }
}

export async function archiveAdminBook(
  prisma: PrismaClient,
  bookId: string,
): Promise<AdminMutationResult<AdminBook>> {
  return serializableTransaction(prisma, async (transaction) => {
    const existing = await findAdminBook(transaction, bookId);

    if (existing === null) {
      return { kind: "not_found" };
    }

    if (existing.archivedAt !== null) {
      return { kind: "ok", value: adminBook(existing) };
    }

    const archived = await transaction.book.update({
      where: { id: bookId },
      data: { archivedAt: new Date() },
      select: adminBookSelection,
    });

    return { kind: "ok", value: adminBook(archived) };
  });
}

export async function restoreAdminBook(
  prisma: PrismaClient,
  bookId: string,
): Promise<AdminMutationResult<AdminBook>> {
  return serializableTransaction(prisma, async (transaction) => {
    const existing = await findAdminBook(transaction, bookId);

    if (existing === null) {
      return { kind: "not_found" };
    }

    if (existing.archivedAt === null) {
      return { kind: "ok", value: adminBook(existing) };
    }

    const activeGenreCount = await transaction.bookGenre.count({
      where: {
        bookId,
        genre: {
          archivedAt: null,
        },
      },
    });

    if (activeGenreCount === 0) {
      return { kind: "no_active_genre" };
    }

    const restored = await transaction.book.update({
      where: { id: bookId },
      data: { archivedAt: null },
      select: adminBookSelection,
    });

    return { kind: "ok", value: adminBook(restored) };
  });
}

export async function findAdminGenres(
  prisma: PrismaClient,
  status: AdminRecordStatus,
): Promise<AdminGenre[]> {
  const rows = await prisma.genre.findMany({
    where: {
      archivedAt: status === "active" ? null : { not: null },
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: adminGenreSelection,
  });

  return rows.map((row) => adminGenre(row));
}

async function activeGenreConflict(
  transaction: Prisma.TransactionClient,
  input: AdminGenreInput,
  genreId?: string,
) {
  return transaction.genre.findFirst({
    where: {
      archivedAt: null,
      ...(genreId === undefined ? {} : { id: { not: genreId } }),
      OR: [
        { name: { equals: input.name, mode: "insensitive" } },
        { slug: { equals: input.slug, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
}

export async function createAdminGenre(
  prisma: PrismaClient,
  input: AdminGenreInput,
): Promise<AdminMutationResult<AdminGenre>> {
  try {
    return await serializableTransaction(prisma, async (transaction) => {
      if ((await activeGenreConflict(transaction, input)) !== null) {
        return { kind: "genre_conflict" };
      }

      const created = await transaction.genre.create({
        data: input,
        select: adminGenreSelection,
      });

      return { kind: "ok", value: adminGenre(created) };
    });
  } catch (error: unknown) {
    if (isKnownPrismaError(error, "P2002")) {
      return { kind: "genre_conflict" };
    }

    throw error;
  }
}

export async function updateAdminGenre(
  prisma: PrismaClient,
  genreId: string,
  input: AdminGenreInput,
): Promise<AdminMutationResult<AdminGenre>> {
  try {
    return await serializableTransaction(prisma, async (transaction) => {
      const existing = await transaction.genre.findUnique({
        where: { id: genreId },
        select: { id: true, archivedAt: true },
      });

      if (existing === null) {
        return { kind: "not_found" };
      }

      if (
        existing.archivedAt === null &&
        (await activeGenreConflict(transaction, input, genreId)) !== null
      ) {
        return { kind: "genre_conflict" };
      }

      const updated = await transaction.genre.update({
        where: { id: genreId },
        data: input,
        select: adminGenreSelection,
      });

      return { kind: "ok", value: adminGenre(updated) };
    });
  } catch (error: unknown) {
    if (isKnownPrismaError(error, "P2002")) {
      return { kind: "genre_conflict" };
    }

    throw error;
  }
}

export async function archiveAdminGenre(
  prisma: PrismaClient,
  genreId: string,
): Promise<AdminMutationResult<AdminGenre>> {
  return serializableTransaction(prisma, async (transaction) => {
    const existing = await transaction.genre.findUnique({
      where: { id: genreId },
      select: adminGenreSelection,
    });

    if (existing === null) {
      return { kind: "not_found" };
    }

    if (existing.archivedAt !== null) {
      return { kind: "ok", value: adminGenre(existing) };
    }

    const affectedBookCount = await transaction.book.count({
      where: {
        archivedAt: null,
        genres: {
          some: { genreId },
        },
        NOT: {
          genres: {
            some: {
              genreId: { not: genreId },
              genre: { archivedAt: null },
            },
          },
        },
      },
    });

    if (affectedBookCount > 0) {
      return { kind: "sole_active_genre" };
    }

    const archived = await transaction.genre.update({
      where: { id: genreId },
      data: { archivedAt: new Date() },
      select: adminGenreSelection,
    });

    return { kind: "ok", value: adminGenre(archived) };
  });
}

export async function restoreAdminGenre(
  prisma: PrismaClient,
  genreId: string,
): Promise<AdminMutationResult<AdminGenre>> {
  try {
    return await serializableTransaction(prisma, async (transaction) => {
      const existing = await transaction.genre.findUnique({
        where: { id: genreId },
        select: adminGenreSelection,
      });

      if (existing === null) {
        return { kind: "not_found" };
      }

      if (existing.archivedAt === null) {
        return { kind: "ok", value: adminGenre(existing) };
      }

      if (
        (await activeGenreConflict(transaction, {
          name: existing.name,
          slug: existing.slug,
        }, genreId)) !== null
      ) {
        return { kind: "genre_conflict" };
      }

      const restored = await transaction.genre.update({
        where: { id: genreId },
        data: { archivedAt: null },
        select: adminGenreSelection,
      });

      return { kind: "ok", value: adminGenre(restored) };
    });
  } catch (error: unknown) {
    if (isKnownPrismaError(error, "P2002")) {
      return { kind: "genre_conflict" };
    }

    throw error;
  }
}
