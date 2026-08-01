import type { PrismaClient } from "@prisma/client";
import {
  catalogueBookDetailSchema,
  catalogueBookSummarySchema,
  genreSummarySchema,
  type CatalogueBooksQuery,
} from "@amazon-2/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  findActiveGenres,
  findCatalogueBookById,
  findCatalogueBooks,
} from "./database.js";

const genre = {
  id: "20000000-0000-4000-8000-000000000001",
  name: "Science Fiction",
  slug: "science-fiction",
};

const summaryRow = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "The Quiet Orbit",
  author: "Avery Stone",
  publicationYear: 2024,
  rating: 4.8,
  coverSeed: "quiet-orbit",
  genres: [{ genre }],
};

const detailRow = {
  ...summaryRow,
  subtitle: "Notes from the outer shelf",
  synopsis: "A long-form catalogue detail synopsis.",
  isbn: "9781234567890",
  pageCount: 336,
  language: "English",
};

const defaultQuery: CatalogueBooksQuery = {
  sort: "newest",
  page: 1,
  pageSize: 24,
};

function prismaMock(options: {
  books?: typeof summaryRow[];
  totalItems?: number;
  detail?: typeof detailRow | null;
  genres?: typeof genre[];
} = {}) {
  const findManyBooks = vi.fn().mockResolvedValue(options.books ?? [summaryRow]);
  const countBooks = vi.fn().mockResolvedValue(options.totalItems ?? 1);
  const findFirstBook = vi.fn().mockResolvedValue(
    options.detail === undefined ? detailRow : options.detail,
  );
  const findManyGenres = vi.fn().mockResolvedValue(options.genres ?? [genre]);
  const transaction = vi.fn(async (operations: Promise<unknown>[]) =>
    Promise.all(operations),
  );
  const prisma = {
    book: {
      findMany: findManyBooks,
      count: countBooks,
      findFirst: findFirstBook,
    },
    genre: {
      findMany: findManyGenres,
    },
    $transaction: transaction,
  } as unknown as PrismaClient;

  return {
    prisma,
    findManyBooks,
    countBooks,
    findFirstBook,
    findManyGenres,
    transaction,
  };
}

describe("catalogue list database query", () => {
  it("searches title or author only and combines active genre and inclusive years", async () => {
    const database = prismaMock();

    await findCatalogueBooks(database.prisma, {
      q: "orbit",
      genre: "science-fiction",
      yearFrom: 2001,
      yearTo: 2024,
      sort: "newest",
      page: 1,
      pageSize: 24,
    });

    const expectedWhere = {
      archivedAt: null,
      OR: [
        { title: { contains: "orbit", mode: "insensitive" } },
        { author: { contains: "orbit", mode: "insensitive" } },
      ],
      genres: {
        some: {
          genre: {
            archivedAt: null,
            slug: "science-fiction",
          },
        },
      },
      publicationYear: {
        gte: 2001,
        lte: 2024,
      },
    };
    const listArguments = database.findManyBooks.mock.calls[0]?.[0];

    expect(listArguments.where).toEqual(expectedWhere);
    expect(database.countBooks).toHaveBeenCalledWith({ where: expectedWhere });
    expect(JSON.stringify(listArguments.where)).not.toContain("synopsis");
    expect(JSON.stringify(listArguments.where)).not.toContain("isbn");
    expect(JSON.stringify(listArguments.where)).not.toContain("genres.name");
  });

  it.each([
    ["newest", [{ createdAt: "desc" }, { id: "asc" }]],
    ["title", [{ title: "asc" }, { id: "asc" }]],
    ["rating", [{ rating: "desc" }, { id: "asc" }]],
  ] as const)("implements the %s stable order", async (sort, orderBy) => {
    const database = prismaMock();

    await findCatalogueBooks(database.prisma, { ...defaultQuery, sort });

    expect(database.findManyBooks).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy }),
    );
  });

  it("paginates after filtering and uses one transaction for rows and count", async () => {
    const database = prismaMock({ totalItems: 99 });

    const result = await findCatalogueBooks(database.prisma, {
      ...defaultQuery,
      page: 3,
      pageSize: 10,
    });

    expect(database.findManyBooks).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      }),
    );
    expect(database.transaction).toHaveBeenCalledOnce();
    expect(result.totalItems).toBe(99);
  });

  it("selects only summary fields and active genre summaries", async () => {
    const database = prismaMock();

    const result = await findCatalogueBooks(database.prisma, defaultQuery);
    const select = database.findManyBooks.mock.calls[0]?.[0].select;

    expect(select).toEqual({
      id: true,
      title: true,
      author: true,
      publicationYear: true,
      rating: true,
      coverSeed: true,
      genres: {
        where: { genre: { archivedAt: null } },
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
      },
    });
    expect(catalogueBookSummarySchema.parse(result.books[0])).toEqual({
      ...summaryRow,
      genres: [genre],
    });
    expect(Object.keys(result.books[0] ?? {})).toEqual([
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

describe("catalogue detail database query", () => {
  it("returns the exact detail contract while selecting only active genres", async () => {
    const database = prismaMock();

    const result = await findCatalogueBookById(database.prisma, summaryRow.id);
    const query = database.findFirstBook.mock.calls[0]?.[0];

    expect(query.where).toEqual({
      id: summaryRow.id,
      archivedAt: null,
    });
    expect(query.select.genres).toEqual({
      where: { genre: { archivedAt: null } },
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
    expect(catalogueBookDetailSchema.parse(result)).toEqual({
      ...detailRow,
      genres: [genre],
    });
  });

  it("returns null for any ID without an active book, including archived books", async () => {
    const database = prismaMock({ detail: null });

    await expect(
      findCatalogueBookById(database.prisma, summaryRow.id),
    ).resolves.toBeNull();
    expect(database.findFirstBook).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: summaryRow.id,
          archivedAt: null,
        },
      }),
    );
  });
});

describe("active genres database query", () => {
  it("excludes archived genres, uses stable name order, and returns exact summaries", async () => {
    const database = prismaMock();

    const result = await findActiveGenres(database.prisma);

    expect(database.findManyGenres).toHaveBeenCalledWith({
      where: { archivedAt: null },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });
    expect(result.map((item) => genreSummarySchema.parse(item))).toEqual([genre]);
  });
});
