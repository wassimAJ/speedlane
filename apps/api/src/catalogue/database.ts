import { Prisma, type PrismaClient } from "@prisma/client";
import {
  catalogueBookDetailSchema,
  catalogueBookSummarySchema,
  genreSummarySchema,
  type CatalogueBookDetail,
  type CatalogueBookSummary,
  type CatalogueBooksQuery,
  type CatalogueSort,
  type GenreSummary,
} from "@amazon-2/contracts";

export interface CatalogueBooksPage {
  books: CatalogueBookSummary[];
  totalItems: number;
}

const activeGenreSelection = Prisma.validator<Prisma.BookGenreFindManyArgs>()({
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

const catalogueBookSummarySelection =
  Prisma.validator<Prisma.BookSelect>()({
    id: true,
    title: true,
    author: true,
    publicationYear: true,
    rating: true,
    coverSeed: true,
    genres: activeGenreSelection,
  });

const catalogueBookDetailSelection =
  Prisma.validator<Prisma.BookSelect>()({
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
    genres: activeGenreSelection,
  });

function activeCatalogueWhere(query: CatalogueBooksQuery): Prisma.BookWhereInput {
  return {
    archivedAt: null,
    ...(query.q === undefined
      ? {}
      : {
          OR: [
            { title: { contains: query.q, mode: "insensitive" as const } },
            { author: { contains: query.q, mode: "insensitive" as const } },
          ],
        }),
    ...(query.genre === undefined
      ? {}
      : {
          genres: {
            some: {
              genre: {
                archivedAt: null,
                slug: query.genre,
              },
            },
          },
        }),
    ...(query.yearFrom === undefined && query.yearTo === undefined
      ? {}
      : {
          publicationYear: {
            ...(query.yearFrom === undefined ? {} : { gte: query.yearFrom }),
            ...(query.yearTo === undefined ? {} : { lte: query.yearTo }),
          },
        }),
  };
}

function catalogueOrderBy(
  sort: CatalogueSort,
): Prisma.BookOrderByWithRelationInput[] {
  switch (sort) {
    case "title":
      return [{ title: "asc" }, { id: "asc" }];
    case "rating":
      return [{ rating: "desc" }, { id: "asc" }];
    case "newest":
      return [{ createdAt: "desc" }, { id: "asc" }];
  }
}

function genresFromAssociations(
  associations: Array<{ genre: GenreSummary }>,
): GenreSummary[] {
  return associations.map(({ genre }) => genreSummarySchema.parse(genre));
}

export async function findCatalogueBooks(
  prisma: PrismaClient,
  query: CatalogueBooksQuery,
): Promise<CatalogueBooksPage> {
  const where = activeCatalogueWhere(query);
  const [books, totalItems] = await prisma.$transaction([
    prisma.book.findMany({
      where,
      orderBy: catalogueOrderBy(query.sort),
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: catalogueBookSummarySelection,
    }),
    prisma.book.count({ where }),
  ]);

  return {
    books: books.map((book) =>
      catalogueBookSummarySchema.parse({
        ...book,
        rating: Number(book.rating),
        genres: genresFromAssociations(book.genres),
      }),
    ),
    totalItems,
  };
}

export async function findCatalogueBookById(
  prisma: PrismaClient,
  bookId: string,
): Promise<CatalogueBookDetail | null> {
  const book = await prisma.book.findFirst({
    where: {
      id: bookId,
      archivedAt: null,
    },
    select: catalogueBookDetailSelection,
  });

  if (book === null) {
    return null;
  }

  return catalogueBookDetailSchema.parse({
    ...book,
    rating: Number(book.rating),
    genres: genresFromAssociations(book.genres),
  });
}

export async function findActiveGenres(
  prisma: PrismaClient,
): Promise<GenreSummary[]> {
  const genres = await prisma.genre.findMany({
    where: {
      archivedAt: null,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  return genres.map((genre) => genreSummarySchema.parse(genre));
}
