import {
  adminBookIdParamsSchema,
  adminBookResponseSchema,
  adminBooksResponseSchema,
  adminCreateBookInputSchema,
  adminCreateGenreInputSchema,
  adminErrorResponseSchema,
  adminGenreIdParamsSchema,
  adminGenreResponseSchema,
  adminGenresResponseSchema,
  adminStatusQuerySchema,
  adminUpdateBookInputSchema,
  adminUpdateGenreInputSchema,
  type AdminBook,
  type AdminBookInput,
  type AdminGenre,
  type AdminGenreInput,
  type AdminRecordStatus,
} from "@amazon-2/contracts";
import {
  Router,
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";

import {
  createAuthenticationMiddleware,
  requireRoles,
  type AuthenticationStore,
} from "../auth/middleware.js";
import type { TokenConfig } from "../auth/token.js";
import { HttpError } from "../http/errors.js";
import type { AdminMutationResult } from "./database.js";

export interface AdminStore {
  findAdminBooks(status: AdminRecordStatus): Promise<AdminBook[]>;
  createAdminBook(input: AdminBookInput): Promise<AdminMutationResult<AdminBook>>;
  updateAdminBook(
    bookId: string,
    input: AdminBookInput,
  ): Promise<AdminMutationResult<AdminBook>>;
  archiveAdminBook(bookId: string): Promise<AdminMutationResult<AdminBook>>;
  restoreAdminBook(bookId: string): Promise<AdminMutationResult<AdminBook>>;
  findAdminGenres(status: AdminRecordStatus): Promise<AdminGenre[]>;
  createAdminGenre(
    input: AdminGenreInput,
  ): Promise<AdminMutationResult<AdminGenre>>;
  updateAdminGenre(
    genreId: string,
    input: AdminGenreInput,
  ): Promise<AdminMutationResult<AdminGenre>>;
  archiveAdminGenre(genreId: string): Promise<AdminMutationResult<AdminGenre>>;
  restoreAdminGenre(genreId: string): Promise<AdminMutationResult<AdminGenre>>;
}

export interface AdminRouterStore extends AdminStore, AuthenticationStore {}

class AdminHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function invalidInput(message: string) {
  return new AdminHttpError(400, message);
}

function invalidBookId() {
  return invalidInput("Book identifier is invalid.");
}

function invalidGenreId() {
  return invalidInput("Genre identifier is invalid.");
}

function respondWithBookResult(
  result: AdminMutationResult<AdminBook>,
  successStatus: number,
  response: Response,
  next: NextFunction,
) {
  switch (result.kind) {
    case "ok":
      response
        .status(successStatus)
        .json(adminBookResponseSchema.parse({ book: result.value }));
      return;
    case "not_found":
      next(new AdminHttpError(404, "Book not found."));
      return;
    case "invalid_genres":
      next(
        invalidInput("Selected genres must all exist and be active."),
      );
      return;
    case "isbn_conflict":
      next(new AdminHttpError(409, "A book with this ISBN already exists."));
      return;
    case "no_active_genre":
      next(
        new AdminHttpError(
          409,
          "Book must have an active associated genre before it can be restored.",
        ),
      );
      return;
    case "genre_conflict":
    case "sole_active_genre":
      next(new AdminHttpError(500, "Internal server error."));
  }
}

function respondWithGenreResult(
  result: AdminMutationResult<AdminGenre>,
  successStatus: number,
  response: Response,
  next: NextFunction,
) {
  switch (result.kind) {
    case "ok":
      response
        .status(successStatus)
        .json(adminGenreResponseSchema.parse({ genre: result.value }));
      return;
    case "not_found":
      next(new AdminHttpError(404, "Genre not found."));
      return;
    case "genre_conflict":
      next(
        new AdminHttpError(
          409,
          "An active genre with this name or slug already exists.",
        ),
      );
      return;
    case "sole_active_genre":
      next(
        new AdminHttpError(
          409,
          "Genre is the only active genre for one or more active books.",
        ),
      );
      return;
    case "invalid_genres":
    case "isbn_conflict":
    case "no_active_genre":
      next(new AdminHttpError(500, "Internal server error."));
  }
}

export function createAdminRouter(
  store: AdminRouterStore,
  tokenConfig: TokenConfig,
) {
  const router = Router();
  const authenticate = createAuthenticationMiddleware(store, tokenConfig);
  const preventAdminCaching: RequestHandler = (_request, response, next) => {
    response.set("Cache-Control", "private, no-store");
    next();
  };

  router.use(preventAdminCaching, authenticate, requireRoles("LIBRARIAN"));

  router.get("/books", async (request, response, next) => {
    const query = adminStatusQuerySchema.safeParse(request.query);

    if (!query.success) {
      next(invalidInput("Admin status query is invalid."));
      return;
    }

    try {
      const books = await store.findAdminBooks(query.data.status);
      response.status(200).json(adminBooksResponseSchema.parse({ books }));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/books", async (request, response, next) => {
    const input = adminCreateBookInputSchema.safeParse(request.body);

    if (!input.success) {
      next(invalidInput("Book input is invalid."));
      return;
    }

    try {
      respondWithBookResult(
        await store.createAdminBook(input.data),
        201,
        response,
        next,
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.put("/books/:bookId", async (request, response, next) => {
    const params = adminBookIdParamsSchema.safeParse(request.params);

    if (!params.success) {
      next(invalidBookId());
      return;
    }

    const input = adminUpdateBookInputSchema.safeParse(request.body);

    if (!input.success) {
      next(invalidInput("Book input is invalid."));
      return;
    }

    try {
      respondWithBookResult(
        await store.updateAdminBook(params.data.bookId, input.data),
        200,
        response,
        next,
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.delete("/books/:bookId", async (request, response, next) => {
    const params = adminBookIdParamsSchema.safeParse(request.params);

    if (!params.success) {
      next(invalidBookId());
      return;
    }

    try {
      respondWithBookResult(
        await store.archiveAdminBook(params.data.bookId),
        200,
        response,
        next,
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/books/:bookId/restore", async (request, response, next) => {
    const params = adminBookIdParamsSchema.safeParse(request.params);

    if (!params.success) {
      next(invalidBookId());
      return;
    }

    try {
      respondWithBookResult(
        await store.restoreAdminBook(params.data.bookId),
        200,
        response,
        next,
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.get("/genres", async (request, response, next) => {
    const query = adminStatusQuerySchema.safeParse(request.query);

    if (!query.success) {
      next(invalidInput("Admin status query is invalid."));
      return;
    }

    try {
      const genres = await store.findAdminGenres(query.data.status);
      response.status(200).json(adminGenresResponseSchema.parse({ genres }));
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/genres", async (request, response, next) => {
    const input = adminCreateGenreInputSchema.safeParse(request.body);

    if (!input.success) {
      next(invalidInput("Genre input is invalid."));
      return;
    }

    try {
      respondWithGenreResult(
        await store.createAdminGenre(input.data),
        201,
        response,
        next,
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.put("/genres/:genreId", async (request, response, next) => {
    const params = adminGenreIdParamsSchema.safeParse(request.params);

    if (!params.success) {
      next(invalidGenreId());
      return;
    }

    const input = adminUpdateGenreInputSchema.safeParse(request.body);

    if (!input.success) {
      next(invalidInput("Genre input is invalid."));
      return;
    }

    try {
      respondWithGenreResult(
        await store.updateAdminGenre(params.data.genreId, input.data),
        200,
        response,
        next,
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.delete("/genres/:genreId", async (request, response, next) => {
    const params = adminGenreIdParamsSchema.safeParse(request.params);

    if (!params.success) {
      next(invalidGenreId());
      return;
    }

    try {
      respondWithGenreResult(
        await store.archiveAdminGenre(params.data.genreId),
        200,
        response,
        next,
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  router.post("/genres/:genreId/restore", async (request, response, next) => {
    const params = adminGenreIdParamsSchema.safeParse(request.params);

    if (!params.success) {
      next(invalidGenreId());
      return;
    }

    try {
      respondWithGenreResult(
        await store.restoreAdminGenre(params.data.genreId),
        200,
        response,
        next,
      );
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}

export const adminNotFoundHandler: RequestHandler = (_request, _response, next) => {
  next(new AdminHttpError(404, "Admin route not found."));
};

function isMalformedJsonError(error: unknown): error is SyntaxError & {
  status: number;
} {
  return (
    error instanceof SyntaxError &&
    "status" in error &&
    error.status === 400 &&
    "body" in error
  );
}

function isPayloadTooLargeError(error: unknown): error is Error & {
  status: number;
  type: string;
} {
  return (
    error instanceof Error &&
    "status" in error &&
    error.status === 413 &&
    "type" in error &&
    error.type === "entity.too.large"
  );
}

function isAdminRequest(request: Request) {
  return (
    request.path === "/api/admin" || request.path.startsWith("/api/admin/")
  );
}

export const adminErrorHandler: ErrorRequestHandler = (
  error: unknown,
  request,
  response,
  next,
) => {
  if (!isAdminRequest(request)) {
    next(error);
    return;
  }

  response.set("Cache-Control", "private, no-store");

  let statusCode = 500;
  let message = "Internal server error.";

  if (error instanceof AdminHttpError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error instanceof HttpError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (isMalformedJsonError(error)) {
    statusCode = 400;
    message = "Request body must be valid JSON.";
  } else if (isPayloadTooLargeError(error)) {
    statusCode = 413;
    message = "Request body is too large.";
  } else {
    console.error("Unhandled admin API error", error);
  }

  response.status(statusCode).json(adminErrorResponseSchema.parse({ error: message }));
};
