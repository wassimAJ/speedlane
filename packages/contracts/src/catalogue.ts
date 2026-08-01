import { z } from "zod";

export const CATALOGUE_DEFAULT_PAGE = 1;
export const CATALOGUE_DEFAULT_PAGE_SIZE = 24;
export const CATALOGUE_MAX_PAGE = 10_000;
export const CATALOGUE_MAX_PAGE_SIZE = 48;

export const catalogueSortSchema = z.enum(["newest", "title", "rating"]);

export const genreSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const yearQueryParameterSchema = z
  .string()
  .regex(/^\d{4}$/)
  .transform(Number)
  .pipe(z.number().int().min(1000).max(9999));

function positiveIntegerQueryParameter(defaultValue: number, maximum?: number) {
  const integerSchema = z
    .string()
    .regex(/^[1-9]\d*$/)
    .transform(Number)
    .pipe(
      maximum === undefined
        ? z.number().int().min(1)
        : z.number().int().min(1).max(maximum),
    );

  return z.preprocess(
    (value) => (value === undefined ? String(defaultValue) : value),
    integerSchema,
  );
}

export const catalogueBooksQuerySchema = z
  .object({
    q: z.string().trim().min(1).max(200).optional(),
    genre: genreSlugSchema.optional(),
    yearFrom: yearQueryParameterSchema.optional(),
    yearTo: yearQueryParameterSchema.optional(),
    sort: z.preprocess(
      (value) => (value === undefined ? "newest" : value),
      catalogueSortSchema,
    ),
    page: positiveIntegerQueryParameter(
      CATALOGUE_DEFAULT_PAGE,
      CATALOGUE_MAX_PAGE,
    ),
    pageSize: positiveIntegerQueryParameter(
      CATALOGUE_DEFAULT_PAGE_SIZE,
      CATALOGUE_MAX_PAGE_SIZE,
    ),
  })
  .strict()
  .superRefine((query, context) => {
    if (
      query.yearFrom !== undefined &&
      query.yearTo !== undefined &&
      query.yearFrom > query.yearTo
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "yearFrom must be less than or equal to yearTo.",
        path: ["yearTo"],
      });
    }
  });

export const genreSummarySchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    slug: genreSlugSchema,
  })
  .strict();

export const catalogueBookSummarySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(240),
    author: z.string().min(1).max(200),
    publicationYear: z.number().int().min(1000).max(9999),
    rating: z.number().min(0).max(5),
    coverSeed: z.string().min(1).max(120),
    genres: z.array(genreSummarySchema).min(1),
  })
  .strict();

export const cataloguePaginationMetaSchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(CATALOGUE_MAX_PAGE_SIZE),
    totalItems: z.number().int().min(0),
    totalPages: z.number().int().min(0),
  })
  .strict();

export const catalogueBooksResponseSchema = z
  .object({
    books: z.array(catalogueBookSummarySchema),
    meta: cataloguePaginationMetaSchema,
  })
  .strict();

export const bookIdParamsSchema = z
  .object({
    bookId: z.string().uuid(),
  })
  .strict();

export const catalogueBookDetailSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(240),
    subtitle: z.string().min(1).max(320).nullable(),
    author: z.string().min(1).max(200),
    synopsis: z.string().min(1),
    isbn: z.string().min(10).max(17),
    publicationYear: z.number().int().min(1000).max(9999),
    pageCount: z.number().int().min(1),
    language: z.string().min(1).max(80),
    rating: z.number().min(0).max(5),
    coverSeed: z.string().min(1).max(120),
    genres: z.array(genreSummarySchema).min(1),
  })
  .strict();

export const catalogueBookDetailResponseSchema = z
  .object({
    book: catalogueBookDetailSchema,
  })
  .strict();

export const genresResponseSchema = z
  .object({
    genres: z.array(genreSummarySchema),
  })
  .strict();

export const catalogueInvalidQueryErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("INVALID_REQUEST"),
        message: z.literal("Catalogue query is invalid."),
      })
      .strict(),
  })
  .strict();

export const catalogueInvalidBookIdErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("INVALID_REQUEST"),
        message: z.literal("Book identifier is invalid."),
      })
      .strict(),
  })
  .strict();

export const catalogueUnauthenticatedErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("UNAUTHENTICATED"),
        message: z.literal("Authentication is required."),
      })
      .strict(),
  })
  .strict();

export const catalogueBookNotFoundErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("NOT_FOUND"),
        message: z.literal("Book not found."),
      })
      .strict(),
  })
  .strict();

export const catalogueErrorResponseSchema = z.union([
  catalogueInvalidQueryErrorResponseSchema,
  catalogueInvalidBookIdErrorResponseSchema,
  catalogueUnauthenticatedErrorResponseSchema,
  catalogueBookNotFoundErrorResponseSchema,
]);

export const catalogueArchiveVisibilitySchema = z
  .object({
    books: z.literal("ACTIVE_ONLY"),
    genres: z.literal("ACTIVE_ONLY"),
    archivedBookDetail: z.literal("NOT_FOUND"),
  })
  .strict();

export const CATALOGUE_ARCHIVE_VISIBILITY =
  catalogueArchiveVisibilitySchema.parse({
    books: "ACTIVE_ONLY",
    genres: "ACTIVE_ONLY",
    archivedBookDetail: "NOT_FOUND",
  });

export type CatalogueSort = z.infer<typeof catalogueSortSchema>;
export type CatalogueBooksQuery = z.infer<typeof catalogueBooksQuerySchema>;
export type GenreSummary = z.infer<typeof genreSummarySchema>;
export type CatalogueBookSummary = z.infer<typeof catalogueBookSummarySchema>;
export type CataloguePaginationMeta = z.infer<
  typeof cataloguePaginationMetaSchema
>;
export type CatalogueBooksResponse = z.infer<
  typeof catalogueBooksResponseSchema
>;
export type BookIdParams = z.infer<typeof bookIdParamsSchema>;
export type CatalogueBookDetail = z.infer<typeof catalogueBookDetailSchema>;
export type CatalogueBookDetailResponse = z.infer<
  typeof catalogueBookDetailResponseSchema
>;
export type GenresResponse = z.infer<typeof genresResponseSchema>;
export type CatalogueErrorResponse = z.infer<
  typeof catalogueErrorResponseSchema
>;
export type CatalogueArchiveVisibility = z.infer<
  typeof catalogueArchiveVisibilitySchema
>;
