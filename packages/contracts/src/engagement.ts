import { z } from "zod";

import {
  bookIdParamsSchema,
  catalogueBookNotFoundErrorResponseSchema,
  catalogueBookSummarySchema,
  catalogueInvalidBookIdErrorResponseSchema,
  catalogueUnauthenticatedErrorResponseSchema,
  genreSummarySchema,
} from "./catalogue.js";

export const MAX_FAVOURITE_GENRES = 5;
export const FOR_YOUR_SHELVES_LIMIT = 6;

export const favouriteGenreIdsInputSchema = z
  .object({
    genreIds: z
      .array(z.string().uuid().transform((genreId) => genreId.toLowerCase()))
      .max(MAX_FAVOURITE_GENRES),
  })
  .strict()
  .superRefine(({ genreIds }, context) => {
    if (new Set(genreIds).size !== genreIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Genre identifiers must be unique.",
        path: ["genreIds"],
      });
    }
  });

export const favouriteGenresResponseSchema = z
  .object({
    genres: z.array(genreSummarySchema).max(MAX_FAVOURITE_GENRES),
  })
  .strict();

export const forYourShelvesResponseSchema = z
  .object({
    books: z.array(catalogueBookSummarySchema).max(FOR_YOUR_SHELVES_LIMIT),
  })
  .strict();

export const readingListStatusSchema = z.enum([
  "WANT_TO_READ",
  "READING",
  "FINISHED",
]);

export const readingListUpdateInputSchema = z
  .object({
    status: readingListStatusSchema.optional(),
  })
  .strict();

export const availableReadingListBookSchema = catalogueBookSummarySchema
  .extend({
    availability: z.literal("AVAILABLE"),
  })
  .strict();

export const unavailableReadingListBookSchema = z
  .object({
    availability: z.literal("UNAVAILABLE"),
    id: z.string().uuid(),
    title: z.string().min(1).max(240),
    author: z.string().min(1).max(200),
    coverSeed: z.string().min(1).max(120),
  })
  .strict();

export const readingListBookSchema = z.discriminatedUnion("availability", [
  availableReadingListBookSchema,
  unavailableReadingListBookSchema,
]);

export const readingListEntrySchema = z
  .object({
    status: readingListStatusSchema,
    book: readingListBookSchema,
  })
  .strict();

export const readingListResponseSchema = z
  .object({
    entries: z.array(readingListEntrySchema),
  })
  .strict();

export const readingListEntryResponseSchema = z
  .object({
    entry: readingListEntrySchema,
  })
  .strict();

export const favouriteGenresInvalidInputErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("INVALID_REQUEST"),
        message: z.literal("Favourite genre selection is invalid."),
      })
      .strict(),
  })
  .strict();

export const readingListInvalidInputErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: z.literal("INVALID_REQUEST"),
        message: z.literal("Reading-list update is invalid."),
      })
      .strict(),
  })
  .strict();

export const engagementErrorResponseSchema = z.union([
  favouriteGenresInvalidInputErrorResponseSchema,
  readingListInvalidInputErrorResponseSchema,
  catalogueInvalidBookIdErrorResponseSchema,
  catalogueUnauthenticatedErrorResponseSchema,
  catalogueBookNotFoundErrorResponseSchema,
]);

export const engagementArchiveVisibilitySchema = z
  .object({
    favouriteGenres: z.literal("ACTIVE_ONLY"),
    personalisedBooks: z.literal("ACTIVE_ONLY"),
    visibleReadingListEntries: z.literal("NOT_REMOVED"),
    activeShelfBooks: z.literal("AVAILABLE"),
    archivedShelfBooks: z.literal("UNAVAILABLE"),
    archivedBookUpdates: z.literal("NOT_FOUND"),
    archivedBookRemoval: z.literal("ALLOWED"),
  })
  .strict();

export const ENGAGEMENT_ARCHIVE_VISIBILITY =
  engagementArchiveVisibilitySchema.parse({
    favouriteGenres: "ACTIVE_ONLY",
    personalisedBooks: "ACTIVE_ONLY",
    visibleReadingListEntries: "NOT_REMOVED",
    activeShelfBooks: "AVAILABLE",
    archivedShelfBooks: "UNAVAILABLE",
    archivedBookUpdates: "NOT_FOUND",
    archivedBookRemoval: "ALLOWED",
  });

export { bookIdParamsSchema as readingListBookIdParamsSchema };

export type FavouriteGenreIdsInput = z.infer<
  typeof favouriteGenreIdsInputSchema
>;
export type FavouriteGenresResponse = z.infer<
  typeof favouriteGenresResponseSchema
>;
export type ForYourShelvesResponse = z.infer<
  typeof forYourShelvesResponseSchema
>;
export type ReadingListStatus = z.infer<typeof readingListStatusSchema>;
export type ReadingListUpdateInput = z.infer<
  typeof readingListUpdateInputSchema
>;
export type AvailableReadingListBook = z.infer<
  typeof availableReadingListBookSchema
>;
export type UnavailableReadingListBook = z.infer<
  typeof unavailableReadingListBookSchema
>;
export type ReadingListBook = z.infer<typeof readingListBookSchema>;
export type ReadingListEntry = z.infer<typeof readingListEntrySchema>;
export type ReadingListResponse = z.infer<typeof readingListResponseSchema>;
export type ReadingListEntryResponse = z.infer<
  typeof readingListEntryResponseSchema
>;
export type EngagementErrorResponse = z.infer<
  typeof engagementErrorResponseSchema
>;
export type EngagementArchiveVisibility = z.infer<
  typeof engagementArchiveVisibilitySchema
>;
