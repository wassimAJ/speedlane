import { Prisma, type PrismaClient } from "@prisma/client";
import {
  FOR_YOUR_SHELVES_LIMIT,
  catalogueBookSummarySchema,
  genreSummarySchema,
  readingListEntrySchema,
  type CatalogueBookSummary,
  type GenreSummary,
  type ReadingListEntry,
  type ReadingListStatus,
} from "@amazon-2/contracts";

const activeBookGenreSelection =
  Prisma.validator<Prisma.BookGenreFindManyArgs>()({
    where: {
      genre: {
        archivedAt: null,
      },
    },
    orderBy: [{ genre: { name: "asc" } }, { genreId: "asc" }],
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

const engagementBookSelection = Prisma.validator<Prisma.BookSelect>()({
  id: true,
  title: true,
  author: true,
  publicationYear: true,
  rating: true,
  coverSeed: true,
  archivedAt: true,
  genres: activeBookGenreSelection,
});

const readingListEntrySelection =
  Prisma.validator<Prisma.ReadingListEntrySelect>()({
    status: true,
    book: {
      select: engagementBookSelection,
    },
  });

type EngagementBookRow = Prisma.BookGetPayload<{
  select: typeof engagementBookSelection;
}>;

type ReadingListEntryRow = Prisma.ReadingListEntryGetPayload<{
  select: typeof readingListEntrySelection;
}>;

function genreSummaries(
  associations: Array<{ genre: GenreSummary }>,
): GenreSummary[] {
  return associations.map(({ genre }) => genreSummarySchema.parse(genre));
}

function availableBookSummary(book: EngagementBookRow): CatalogueBookSummary {
  return catalogueBookSummarySchema.parse({
    id: book.id,
    title: book.title,
    author: book.author,
    publicationYear: book.publicationYear,
    rating: Number(book.rating),
    coverSeed: book.coverSeed,
    genres: genreSummaries(book.genres),
  });
}

function readingListEntry(row: ReadingListEntryRow): ReadingListEntry {
  const book =
    row.book.archivedAt === null
      ? {
          ...availableBookSummary(row.book),
          availability: "AVAILABLE" as const,
        }
      : {
          availability: "UNAVAILABLE" as const,
          id: row.book.id,
          title: row.book.title,
          author: row.book.author,
          coverSeed: row.book.coverSeed,
        };

  return readingListEntrySchema.parse({
    status: row.status,
    book,
  });
}

export async function findFavouriteGenres(
  prisma: PrismaClient,
  userId: string,
): Promise<GenreSummary[]> {
  const favourites = await prisma.favouriteGenre.findMany({
    where: {
      userId,
      removedAt: null,
      genre: {
        archivedAt: null,
      },
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

  return genreSummaries(favourites);
}

export async function replaceFavouriteGenres(
  prisma: PrismaClient,
  userId: string,
  genreIds: string[],
): Promise<GenreSummary[] | null> {
  return prisma.$transaction(
    async (transaction) => {
      const canonicalGenreIds = genreIds.map((genreId) => genreId.toLowerCase());
      const genres =
        canonicalGenreIds.length === 0
          ? []
          : await transaction.genre.findMany({
              where: {
                id: { in: canonicalGenreIds },
                archivedAt: null,
              },
              select: {
                id: true,
                name: true,
                slug: true,
              },
            });

      if (genres.length !== canonicalGenreIds.length) {
        return null;
      }

      const genresById = new Map(
        genres.map((genre) => [
          genre.id.toLowerCase(),
          genreSummarySchema.parse(genre),
        ]),
      );
      const orderedGenres: GenreSummary[] = [];

      for (const genreId of canonicalGenreIds) {
        const genre = genresById.get(genreId);

        if (genre === undefined) {
          return null;
        }

        orderedGenres.push(genre);
      }

      await transaction.favouriteGenre.updateMany({
        where: {
          userId,
          removedAt: null,
        },
        data: {
          removedAt: new Date(),
        },
      });

      for (const [index, genreId] of canonicalGenreIds.entries()) {
        const position = index + 1;

        await transaction.favouriteGenre.upsert({
          where: {
            userId_genreId: {
              userId,
              genreId,
            },
          },
          create: {
            userId,
            genreId,
            position,
          },
          update: {
            position,
            removedAt: null,
          },
        });
      }

      return orderedGenres;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function findForYourShelves(
  prisma: PrismaClient,
  userId: string,
): Promise<CatalogueBookSummary[]> {
  return prisma.$transaction(async (transaction) => {
    const favourites = await transaction.favouriteGenre.findMany({
      where: {
        userId,
        removedAt: null,
        genre: {
          archivedAt: null,
        },
      },
      orderBy: [{ position: "asc" }, { genreId: "asc" }],
      select: {
        genreId: true,
      },
    });
    const books: CatalogueBookSummary[] = [];

    for (const favourite of favourites) {
      const remaining = FOR_YOUR_SHELVES_LIMIT - books.length;

      if (remaining === 0) {
        break;
      }

      const rows = await transaction.book.findMany({
        where: {
          archivedAt: null,
          ...(books.length === 0
            ? {}
            : {
                id: {
                  notIn: books.map((book) => book.id),
                },
              }),
          genres: {
            some: {
              genreId: favourite.genreId,
              genre: {
                archivedAt: null,
              },
            },
          },
          readingList: {
            none: {
              userId,
              removedAt: null,
            },
          },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: remaining,
        select: engagementBookSelection,
      });

      books.push(...rows.map((book) => availableBookSummary(book)));
    }

    return books;
  });
}

export async function findReadingList(
  prisma: PrismaClient,
  userId: string,
): Promise<ReadingListEntry[]> {
  const rows = await prisma.readingListEntry.findMany({
    where: {
      userId,
      removedAt: null,
    },
    orderBy: [{ updatedAt: "desc" }, { bookId: "asc" }],
    select: readingListEntrySelection,
  });

  return rows.map((row) => readingListEntry(row));
}

export async function upsertReadingListEntry(
  prisma: PrismaClient,
  userId: string,
  bookId: string,
  requestedStatus: ReadingListStatus | undefined,
): Promise<ReadingListEntry | null> {
  return prisma.$transaction(
    async (transaction) => {
      const activeBook = await transaction.book.findFirst({
        where: {
          id: bookId,
          archivedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (activeBook === null) {
        return null;
      }

      const existing = await transaction.readingListEntry.findUnique({
        where: {
          userId_bookId: {
            userId,
            bookId,
          },
        },
        select: {
          status: true,
          removedAt: true,
        },
      });
      const status = requestedStatus ?? existing?.status ?? "WANT_TO_READ";
      const row = await transaction.readingListEntry.upsert({
        where: {
          userId_bookId: {
            userId,
            bookId,
          },
        },
        create: {
          userId,
          bookId,
          status,
        },
        update: {
          status,
          removedAt: null,
        },
        select: readingListEntrySelection,
      });

      return readingListEntry(row);
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    },
  );
}

export async function removeReadingListEntry(
  prisma: PrismaClient,
  userId: string,
  bookId: string,
): Promise<void> {
  await prisma.readingListEntry.updateMany({
    where: {
      userId,
      bookId,
      removedAt: null,
    },
    data: {
      removedAt: new Date(),
    },
  });
}
