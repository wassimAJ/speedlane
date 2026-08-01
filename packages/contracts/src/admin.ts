import { z } from "zod";

import { genreSlugSchema } from "./catalogue.js";

export const adminRecordStatusSchema = z.enum(["active", "archived"]);

export const adminStatusQuerySchema = z
  .object({
    status: adminRecordStatusSchema,
  })
  .strict();

export const adminBookIdParamsSchema = z
  .object({
    bookId: z.string().uuid(),
  })
  .strict();

export const adminGenreIdParamsSchema = z
  .object({
    genreId: z.string().uuid(),
  })
  .strict();

const adminArchivedAtSchema = z.string().datetime({ offset: true }).nullable();

function hasValidIsbnChecksum(isbn: string) {
  if (/^\d{13}$/.test(isbn)) {
    const total = [...isbn.slice(0, 12)].reduce(
      (sum, digit, index) => sum + Number(digit) * (index % 2 === 0 ? 1 : 3),
      0,
    );

    return (10 - (total % 10)) % 10 === Number(isbn[12]);
  }

  if (/^\d{9}[\dX]$/.test(isbn)) {
    const total = [...isbn].reduce(
      (sum, digit, index) =>
        sum + (digit === "X" ? 10 : Number(digit)) * (10 - index),
      0,
    );

    return total % 11 === 0;
  }

  return false;
}

export const adminIsbnSchema = z
  .string()
  .trim()
  .min(10)
  .max(17)
  .regex(/^[\dXx-]+$/)
  .transform((isbn) => isbn.replaceAll("-", "").toUpperCase())
  .refine(hasValidIsbnChecksum, "ISBN checksum is invalid.");

const adminGenreIdsSchema = z
  .array(z.string().uuid().transform((genreId) => genreId.toLowerCase()))
  .min(1)
  .superRefine((genreIds, context) => {
    if (new Set(genreIds).size !== genreIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Genre identifiers must be unique.",
      });
    }
  });

export const adminBookInputSchema = z
  .object({
    title: z.string().trim().min(1).max(240),
    subtitle: z.string().trim().min(1).max(320).nullable(),
    author: z.string().trim().min(1).max(200),
    synopsis: z.string().trim().min(1).max(20_000),
    isbn: adminIsbnSchema,
    publicationYear: z.number().int().min(1000).max(9999),
    pageCount: z.number().int().min(1).max(100_000),
    language: z.string().trim().min(1).max(80),
    rating: z.number().finite().min(0).max(5).multipleOf(0.1),
    coverSeed: z.string().trim().min(1).max(120),
    genreIds: adminGenreIdsSchema,
  })
  .strict();

export const adminCreateBookInputSchema = adminBookInputSchema;
export const adminUpdateBookInputSchema = adminBookInputSchema;

export const adminGenreInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    slug: genreSlugSchema,
  })
  .strict();

export const adminCreateGenreInputSchema = adminGenreInputSchema;
export const adminUpdateGenreInputSchema = adminGenreInputSchema;

export const adminGenreSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(100),
    slug: genreSlugSchema,
    archivedAt: adminArchivedAtSchema,
  })
  .strict();

export const adminBookSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(240),
    subtitle: z.string().min(1).max(320).nullable(),
    author: z.string().min(1).max(200),
    synopsis: z.string().min(1).max(20_000),
    isbn: adminIsbnSchema,
    publicationYear: z.number().int().min(1000).max(9999),
    pageCount: z.number().int().min(1).max(100_000),
    language: z.string().min(1).max(80),
    rating: z.number().finite().min(0).max(5).multipleOf(0.1),
    coverSeed: z.string().min(1).max(120),
    archivedAt: adminArchivedAtSchema,
    genres: z.array(adminGenreSchema).min(1),
  })
  .strict();

export const adminBooksResponseSchema = z
  .object({
    books: z.array(adminBookSchema),
  })
  .strict();

export const adminBookResponseSchema = z
  .object({
    book: adminBookSchema,
  })
  .strict();

export const adminGenresResponseSchema = z
  .object({
    genres: z.array(adminGenreSchema),
  })
  .strict();

export const adminGenreResponseSchema = z
  .object({
    genre: adminGenreSchema,
  })
  .strict();

export const adminErrorResponseSchema = z
  .object({
    error: z.string().min(1),
  })
  .strict();

export const adminManagementRulesSchema = z
  .object({
    authorization: z.literal("LIBRARIAN_ONLY"),
    deletion: z.literal("SOFT_ARCHIVE_ONLY"),
    bookGenreSelection: z.literal("ONE_OR_MORE_ACTIVE_GENRES"),
    associationsOnArchive: z.literal("PRESERVED"),
    genreUniqueness: z.literal("ACTIVE_NAME_AND_SLUG"),
    soleActiveGenreArchive: z.literal("CONFLICT"),
    bookRestoreWithoutActiveGenre: z.literal("CONFLICT"),
  })
  .strict();

export const ADMIN_MANAGEMENT_RULES = adminManagementRulesSchema.parse({
  authorization: "LIBRARIAN_ONLY",
  deletion: "SOFT_ARCHIVE_ONLY",
  bookGenreSelection: "ONE_OR_MORE_ACTIVE_GENRES",
  associationsOnArchive: "PRESERVED",
  genreUniqueness: "ACTIVE_NAME_AND_SLUG",
  soleActiveGenreArchive: "CONFLICT",
  bookRestoreWithoutActiveGenre: "CONFLICT",
});

export type AdminRecordStatus = z.infer<typeof adminRecordStatusSchema>;
export type AdminStatusQuery = z.infer<typeof adminStatusQuerySchema>;
export type AdminBookIdParams = z.infer<typeof adminBookIdParamsSchema>;
export type AdminGenreIdParams = z.infer<typeof adminGenreIdParamsSchema>;
export type AdminBookInput = z.infer<typeof adminBookInputSchema>;
export type AdminCreateBookInput = z.infer<
  typeof adminCreateBookInputSchema
>;
export type AdminUpdateBookInput = z.infer<
  typeof adminUpdateBookInputSchema
>;
export type AdminGenreInput = z.infer<typeof adminGenreInputSchema>;
export type AdminCreateGenreInput = z.infer<
  typeof adminCreateGenreInputSchema
>;
export type AdminUpdateGenreInput = z.infer<
  typeof adminUpdateGenreInputSchema
>;
export type AdminGenre = z.infer<typeof adminGenreSchema>;
export type AdminBook = z.infer<typeof adminBookSchema>;
export type AdminBooksResponse = z.infer<typeof adminBooksResponseSchema>;
export type AdminBookResponse = z.infer<typeof adminBookResponseSchema>;
export type AdminGenresResponse = z.infer<typeof adminGenresResponseSchema>;
export type AdminGenreResponse = z.infer<typeof adminGenreResponseSchema>;
export type AdminErrorResponse = z.infer<typeof adminErrorResponseSchema>;
export type AdminManagementRules = z.infer<
  typeof adminManagementRulesSchema
>;
