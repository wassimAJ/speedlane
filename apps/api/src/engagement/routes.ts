import {
  favouriteGenreIdsInputSchema,
  favouriteGenresResponseSchema,
  forYourShelvesResponseSchema,
  readingListBookIdParamsSchema,
  readingListEntryResponseSchema,
  readingListResponseSchema,
  readingListUpdateInputSchema,
  type CatalogueBookSummary,
  type GenreSummary,
  type ReadingListEntry,
  type ReadingListStatus,
} from "@amazon-2/contracts";
import { Router, type RequestHandler } from "express";

import {
  createAuthenticationMiddleware,
  requireAuthenticatedUser,
  type AuthenticationStore,
} from "../auth/middleware.js";
import type { TokenConfig } from "../auth/token.js";
import { HttpError } from "../http/errors.js";

export interface EngagementStore {
  findFavouriteGenres(userId: string): Promise<GenreSummary[]>;
  replaceFavouriteGenres(
    userId: string,
    genreIds: string[],
  ): Promise<GenreSummary[] | null>;
  findForYourShelves(userId: string): Promise<CatalogueBookSummary[]>;
  findReadingList(userId: string): Promise<ReadingListEntry[]>;
  upsertReadingListEntry(
    userId: string,
    bookId: string,
    status: ReadingListStatus | undefined,
  ): Promise<ReadingListEntry | null>;
  removeReadingListEntry(userId: string, bookId: string): Promise<void>;
}

export interface EngagementRouterStore
  extends EngagementStore,
    AuthenticationStore {}

export function createEngagementRouter(
  store: EngagementRouterStore,
  tokenConfig: TokenConfig,
) {
  const router = Router();
  const authenticate = createAuthenticationMiddleware(store, tokenConfig);
  const preventEngagementCaching: RequestHandler = (_request, response, next) => {
    response.set("Cache-Control", "private, no-store");
    next();
  };

  router.get(
    "/me/favourite-genres",
    preventEngagementCaching,
    authenticate,
    async (request, response, next) => {
      try {
        const genres = await store.findFavouriteGenres(
          requireAuthenticatedUser(request).id,
        );

        response.status(200).json(favouriteGenresResponseSchema.parse({ genres }));
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  router.put(
    "/me/favourite-genres",
    preventEngagementCaching,
    authenticate,
    async (request, response, next) => {
      const input = favouriteGenreIdsInputSchema.safeParse(request.body);

      if (!input.success) {
        next(
          new HttpError(
            400,
            "INVALID_REQUEST",
            "Favourite genre selection is invalid.",
          ),
        );
        return;
      }

      try {
        const genres = await store.replaceFavouriteGenres(
          requireAuthenticatedUser(request).id,
          input.data.genreIds,
        );

        if (genres === null) {
          next(
            new HttpError(
              400,
              "INVALID_REQUEST",
              "Favourite genre selection is invalid.",
            ),
          );
          return;
        }

        response.status(200).json(favouriteGenresResponseSchema.parse({ genres }));
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  router.get(
    "/me/for-your-shelves",
    preventEngagementCaching,
    authenticate,
    async (request, response, next) => {
      try {
        const books = await store.findForYourShelves(
          requireAuthenticatedUser(request).id,
        );

        response.status(200).json(forYourShelvesResponseSchema.parse({ books }));
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  router.get(
    "/me/reading-list",
    preventEngagementCaching,
    authenticate,
    async (request, response, next) => {
      try {
        const entries = await store.findReadingList(
          requireAuthenticatedUser(request).id,
        );

        response.status(200).json(readingListResponseSchema.parse({ entries }));
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  router.put(
    "/me/reading-list/:bookId",
    preventEngagementCaching,
    authenticate,
    async (request, response, next) => {
      const params = readingListBookIdParamsSchema.safeParse(request.params);

      if (!params.success) {
        next(
          new HttpError(400, "INVALID_REQUEST", "Book identifier is invalid."),
        );
        return;
      }

      const input = readingListUpdateInputSchema.safeParse(request.body);

      if (!input.success) {
        next(
          new HttpError(
            400,
            "INVALID_REQUEST",
            "Reading-list update is invalid.",
          ),
        );
        return;
      }

      try {
        const entry = await store.upsertReadingListEntry(
          requireAuthenticatedUser(request).id,
          params.data.bookId,
          input.data.status,
        );

        if (entry === null) {
          next(new HttpError(404, "NOT_FOUND", "Book not found."));
          return;
        }

        response.status(200).json(readingListEntryResponseSchema.parse({ entry }));
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  router.delete(
    "/me/reading-list/:bookId",
    preventEngagementCaching,
    authenticate,
    async (request, response, next) => {
      const params = readingListBookIdParamsSchema.safeParse(request.params);

      if (!params.success) {
        next(
          new HttpError(400, "INVALID_REQUEST", "Book identifier is invalid."),
        );
        return;
      }

      try {
        await store.removeReadingListEntry(
          requireAuthenticatedUser(request).id,
          params.data.bookId,
        );
        response.status(204).send();
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  return router;
}
