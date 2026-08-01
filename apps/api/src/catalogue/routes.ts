import {
  bookIdParamsSchema,
  catalogueBookDetailResponseSchema,
  catalogueBooksQuerySchema,
  catalogueBooksResponseSchema,
  genresResponseSchema,
  type CatalogueBookDetail,
  type CatalogueBookSummary,
  type CatalogueBooksQuery,
  type GenreSummary,
} from "@amazon-2/contracts";
import { Router, type RequestHandler } from "express";

import {
  createAuthenticationMiddleware,
  type AuthenticationStore,
} from "../auth/middleware.js";
import type { TokenConfig } from "../auth/token.js";
import { HttpError } from "../http/errors.js";

export interface CatalogueStore {
  findCatalogueBooks(query: CatalogueBooksQuery): Promise<{
    books: CatalogueBookSummary[];
    totalItems: number;
  }>;
  findCatalogueBookById(bookId: string): Promise<CatalogueBookDetail | null>;
  findActiveGenres(): Promise<GenreSummary[]>;
}

export interface CatalogueRouterStore
  extends CatalogueStore,
    AuthenticationStore {}

export function createCatalogueRouter(
  store: CatalogueRouterStore,
  tokenConfig: TokenConfig,
) {
  const router = Router();
  const authenticate = createAuthenticationMiddleware(store, tokenConfig);
  const preventCatalogueCaching: RequestHandler = (_request, response, next) => {
    response.set("Cache-Control", "private, no-store");
    next();
  };

  router.get(
    "/books",
    preventCatalogueCaching,
    authenticate,
    async (request, response, next) => {
      const query = catalogueBooksQuerySchema.safeParse(request.query);

      if (!query.success) {
        next(
          new HttpError(400, "INVALID_REQUEST", "Catalogue query is invalid."),
        );
        return;
      }

      try {
        const result = await store.findCatalogueBooks(query.data);
        const body = catalogueBooksResponseSchema.parse({
          books: result.books,
          meta: {
            page: query.data.page,
            pageSize: query.data.pageSize,
            totalItems: result.totalItems,
            totalPages:
              result.totalItems === 0
                ? 0
                : Math.ceil(result.totalItems / query.data.pageSize),
          },
        });

        response.status(200).json(body);
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  router.get(
    "/books/:bookId",
    preventCatalogueCaching,
    authenticate,
    async (request, response, next) => {
      const params = bookIdParamsSchema.safeParse(request.params);

      if (!params.success) {
        next(
          new HttpError(400, "INVALID_REQUEST", "Book identifier is invalid."),
        );
        return;
      }

      try {
        const book = await store.findCatalogueBookById(params.data.bookId);

        if (book === null) {
          next(new HttpError(404, "NOT_FOUND", "Book not found."));
          return;
        }

        response.status(200).json(
          catalogueBookDetailResponseSchema.parse({
            book,
          }),
        );
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  router.get(
    "/genres",
    preventCatalogueCaching,
    authenticate,
    async (_request, response, next) => {
      try {
        const genres = await store.findActiveGenres();

        response.status(200).json(genresResponseSchema.parse({ genres }));
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  return router;
}
