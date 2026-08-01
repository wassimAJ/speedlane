import {
  CATALOGUE_DEFAULT_PAGE,
  CATALOGUE_DEFAULT_PAGE_SIZE,
  CATALOGUE_MAX_PAGE,
  CATALOGUE_MAX_PAGE_SIZE,
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
  apiErrorResponseSchema,
  bookIdParamsSchema,
  catalogueBookDetailResponseSchema,
  catalogueBooksQuerySchema,
  catalogueBooksResponseSchema,
  discoveryResponseSchema,
  favouriteGenreIdsInputSchema,
  favouriteGenresResponseSchema,
  forYourShelvesResponseSchema,
  genresResponseSchema,
  healthResponseSchema,
  loginInputSchema,
  readingListEntryResponseSchema,
  readingListResponseSchema,
  readingListUpdateInputSchema,
  sessionResponseSchema,
} from "@amazon-2/contracts";
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV3,
  type ResponseConfig,
} from "@asteasolutions/zod-to-openapi";
import { z, type ZodTypeAny } from "zod";

extendZodWithOpenApi(z);

const JSON_MEDIA_TYPE = "application/json";
const privateCacheHeaders = {
  "Cache-Control": {
    description: "Private responses are not stored by shared or browser caches.",
    schema: {
      type: "string" as const,
    },
  },
};
const setCookieHeader = {
  "Set-Cookie": {
    description:
      "Sets or clears the HTTP-only amazon2_session cookie. The cookie value is intentionally omitted from this documentation.",
    schema: {
      type: "string" as const,
    },
  },
};

function jsonResponse(
  schema: ZodTypeAny,
  description: string,
  options: { private?: boolean; setCookie?: boolean } = {},
): ResponseConfig {
  return {
    description,
    ...(options.private ? { headers: privateCacheHeaders } : {}),
    ...(options.setCookie ? { headers: setCookieHeader } : {}),
    content: {
      [JSON_MEDIA_TYPE]: {
        schema,
      },
    },
  };
}

function privateJsonResponse(schema: ZodTypeAny, description: string) {
  return jsonResponse(schema, description, { private: true });
}

function requestBody(schema: ZodTypeAny, description: string) {
  return {
    required: true,
    description,
    content: {
      [JSON_MEDIA_TYPE]: {
        schema,
      },
    },
  };
}

function createOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  const schemas = {
    healthResponse: registry.register("HealthResponse", healthResponseSchema),
    apiError: registry.register("ApiError", apiErrorResponseSchema),
    loginInput: registry.register("LoginInput", loginInputSchema),
    sessionResponse: registry.register("SessionResponse", sessionResponseSchema),
    discoveryResponse: registry.register(
      "DiscoveryResponse",
      discoveryResponseSchema,
    ),
    catalogueBooksQuery: registry.register(
      "CatalogueBooksQuery",
      catalogueBooksQuerySchema,
    ),
    catalogueBooksResponse: registry.register(
      "CatalogueBooksResponse",
      catalogueBooksResponseSchema,
    ),
    bookIdParams: registry.register("BookIdParams", bookIdParamsSchema),
    catalogueBookDetailResponse: registry.register(
      "CatalogueBookDetailResponse",
      catalogueBookDetailResponseSchema,
    ),
    genresResponse: registry.register("GenresResponse", genresResponseSchema),
    favouriteGenresResponse: registry.register(
      "FavouriteGenresResponse",
      favouriteGenresResponseSchema,
    ),
    favouriteGenreIdsInput: registry.register(
      "FavouriteGenreIdsInput",
      favouriteGenreIdsInputSchema,
    ),
    forYourShelvesResponse: registry.register(
      "ForYourShelvesResponse",
      forYourShelvesResponseSchema,
    ),
    readingListResponse: registry.register(
      "ReadingListResponse",
      readingListResponseSchema,
    ),
    readingListUpdateInput: registry.register(
      "ReadingListUpdateInput",
      readingListUpdateInputSchema,
    ),
    readingListEntryResponse: registry.register(
      "ReadingListEntryResponse",
      readingListEntryResponseSchema,
    ),
    adminStatusQuery: registry.register(
      "AdminStatusQuery",
      adminStatusQuerySchema,
    ),
    adminBookIdParams: registry.register(
      "AdminBookIdParams",
      adminBookIdParamsSchema,
    ),
    adminCreateBookInput: registry.register(
      "AdminCreateBookInput",
      adminCreateBookInputSchema,
    ),
    adminUpdateBookInput: registry.register(
      "AdminUpdateBookInput",
      adminUpdateBookInputSchema,
    ),
    adminBookResponse: registry.register(
      "AdminBookResponse",
      adminBookResponseSchema,
    ),
    adminBooksResponse: registry.register(
      "AdminBooksResponse",
      adminBooksResponseSchema,
    ),
    adminGenreIdParams: registry.register(
      "AdminGenreIdParams",
      adminGenreIdParamsSchema,
    ),
    adminCreateGenreInput: registry.register(
      "AdminCreateGenreInput",
      adminCreateGenreInputSchema,
    ),
    adminUpdateGenreInput: registry.register(
      "AdminUpdateGenreInput",
      adminUpdateGenreInputSchema,
    ),
    adminGenreResponse: registry.register(
      "AdminGenreResponse",
      adminGenreResponseSchema,
    ),
    adminGenresResponse: registry.register(
      "AdminGenresResponse",
      adminGenresResponseSchema,
    ),
    adminError: registry.register("AdminError", adminErrorResponseSchema),
  };

  registry.registerComponent("securitySchemes", "cookieAuth", {
    type: "apiKey",
    in: "cookie",
    name: "amazon2_session",
    description:
      "HTTP-only, short-lived JWT session cookie. Reader routes accept READER or LIBRARIAN sessions; admin routes require LIBRARIAN.",
  });

  const publicAccess: [] = [];
  const cookieSecurity = [{ cookieAuth: [] }];
  const catalogueQueryFields = catalogueBooksQuerySchema.innerType().shape;
  const catalogueQueryDocumentationSchema = z.object({
    q: catalogueQueryFields.q.openapi({
      description: "Case-insensitive title or author search.",
    }),
    genre: catalogueQueryFields.genre.openapi({
      description: "Active genre slug.",
    }),
    yearFrom: catalogueQueryFields.yearFrom.openapi({
      type: "integer",
      minimum: 1000,
      maximum: 9999,
      description: "Inclusive publication-year lower bound.",
    }),
    yearTo: catalogueQueryFields.yearTo.openapi({
      type: "integer",
      minimum: 1000,
      maximum: 9999,
      description:
        "Inclusive publication-year upper bound; must be at least yearFrom.",
    }),
    sort: catalogueQueryFields.sort.openapi({
      type: "string",
      enum: ["newest", "title", "rating"],
      default: "newest",
      description: "Stable sort mode; book ID is the final tie-breaker.",
    }),
    page: catalogueQueryFields.page.openapi({
      type: "integer",
      minimum: 1,
      maximum: CATALOGUE_MAX_PAGE,
      default: CATALOGUE_DEFAULT_PAGE,
    }),
    pageSize: catalogueQueryFields.pageSize.openapi({
      type: "integer",
      minimum: 1,
      maximum: CATALOGUE_MAX_PAGE_SIZE,
      default: CATALOGUE_DEFAULT_PAGE_SIZE,
    }),
  });

  registry.registerPath({
    method: "get",
    path: "/api/health",
    tags: ["System"],
    summary: "Check API and database health",
    security: publicAccess,
    responses: {
      200: jsonResponse(schemas.healthResponse, "API and database are healthy."),
      503: jsonResponse(
        schemas.apiError,
        "The database health check is unavailable.",
      ),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/login",
    tags: ["Authentication"],
    summary: "Create a session",
    description:
      "Validates demo or persisted credentials and sets the HTTP-only session cookie. No credential examples are published.",
    security: publicAccess,
    request: {
      body: requestBody(schemas.loginInput, "Email address and password."),
    },
    responses: {
      200: jsonResponse(schemas.sessionResponse, "Authenticated session.", {
        setCookie: true,
      }),
      400: jsonResponse(schemas.apiError, "Login input is invalid."),
      401: jsonResponse(schemas.apiError, "Credentials are invalid."),
      413: jsonResponse(schemas.apiError, "Request body is too large."),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/auth/logout",
    tags: ["Authentication"],
    summary: "Clear the session cookie",
    description: "This operation is idempotent and does not require authentication.",
    security: publicAccess,
    responses: {
      204: {
        description: "Session cookie cleared.",
        headers: setCookieHeader,
      },
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/auth/me",
    tags: ["Authentication"],
    summary: "Get the authenticated user",
    security: cookieSecurity,
    responses: {
      200: privateJsonResponse(
        schemas.sessionResponse,
        "Current authenticated user.",
      ),
      401: privateJsonResponse(schemas.apiError, "Authentication is required."),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/discover",
    tags: ["Discovery"],
    summary: "Discover newest books",
    description:
      "Returns at most six newest active seeded books with a stable book-ID tie-breaker. Public previews expose only coverSeed, title, author, and genre names.",
    security: publicAccess,
    responses: {
      200: jsonResponse(
        schemas.discoveryResponse,
        "Newest active public book previews.",
      ),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/books",
    tags: ["Catalogue"],
    summary: "Browse the active catalogue",
    description:
      "Search matches title or author only. Archived books are excluded, and every sort uses book ID as its stable final tie-breaker.",
    security: cookieSecurity,
    request: {
      query: catalogueQueryDocumentationSchema,
    },
    responses: {
      200: privateJsonResponse(
        schemas.catalogueBooksResponse,
        "Paginated active books.",
      ),
      400: privateJsonResponse(schemas.apiError, "Catalogue query is invalid."),
      401: privateJsonResponse(schemas.apiError, "Authentication is required."),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/books/{bookId}",
    tags: ["Catalogue"],
    summary: "Get an active book",
    description: "Archived books are deliberately reported as not found to readers.",
    security: cookieSecurity,
    request: {
      params: schemas.bookIdParams,
    },
    responses: {
      200: privateJsonResponse(
        schemas.catalogueBookDetailResponse,
        "Active book detail.",
      ),
      400: privateJsonResponse(schemas.apiError, "Book ID is invalid."),
      401: privateJsonResponse(schemas.apiError, "Authentication is required."),
      404: privateJsonResponse(
        schemas.apiError,
        "Book does not exist or is archived.",
      ),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/genres",
    tags: ["Catalogue"],
    summary: "List active genres",
    description: "Archived genres are excluded.",
    security: cookieSecurity,
    responses: {
      200: privateJsonResponse(schemas.genresResponse, "Active genres."),
      401: privateJsonResponse(schemas.apiError, "Authentication is required."),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/me/favourite-genres",
    tags: ["Engagement"],
    summary: "Get favourite genres",
    description: "Only active favourite genres are returned.",
    security: cookieSecurity,
    responses: {
      200: privateJsonResponse(
        schemas.favouriteGenresResponse,
        "Favourite active genres in saved order.",
      ),
      401: privateJsonResponse(schemas.apiError, "Authentication is required."),
    },
  });

  registry.registerPath({
    method: "put",
    path: "/api/me/favourite-genres",
    tags: ["Engagement"],
    summary: "Replace favourite genres",
    description:
      "Replaces the full ordered selection with at most five unique, active genre IDs.",
    security: cookieSecurity,
    request: {
      body: requestBody(
        schemas.favouriteGenreIdsInput,
        "The complete ordered favourite-genre selection.",
      ),
    },
    responses: {
      200: privateJsonResponse(
        schemas.favouriteGenresResponse,
        "Updated favourite genres.",
      ),
      400: privateJsonResponse(
        schemas.apiError,
        "Selection is invalid or contains inactive or unknown genres.",
      ),
      401: privateJsonResponse(schemas.apiError, "Authentication is required."),
      413: jsonResponse(schemas.apiError, "Request body is too large."),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/me/for-your-shelves",
    tags: ["Engagement"],
    summary: "Get personalised shelf suggestions",
    description:
      "Returns at most six active books selected from the reader's active favourite genres, ordered by favourite-genre preference order, then newest, then book ID. Books already on the user's visible reading list are excluded.",
    security: cookieSecurity,
    responses: {
      200: privateJsonResponse(
        schemas.forYourShelvesResponse,
        "Personalised active books.",
      ),
      401: privateJsonResponse(schemas.apiError, "Authentication is required."),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/me/reading-list",
    tags: ["Engagement"],
    summary: "Get the reading list",
    description:
      "Removed entries are excluded. Books archived after being saved remain visible with UNAVAILABLE preview data only.",
    security: cookieSecurity,
    responses: {
      200: privateJsonResponse(schemas.readingListResponse, "Reading-list entries."),
      401: privateJsonResponse(schemas.apiError, "Authentication is required."),
    },
  });

  registry.registerPath({
    method: "put",
    path: "/api/me/reading-list/{bookId}",
    tags: ["Engagement"],
    summary: "Add or update a reading-list entry",
    description:
      "When status is omitted, a missing entry is created as WANT_TO_READ and a soft-removed entry is restored with its previously saved state. The endpoint maintains one entry per user/book. Archived books cannot be added or updated and return 404.",
    security: cookieSecurity,
    request: {
      params: schemas.bookIdParams,
      body: requestBody(
        schemas.readingListUpdateInput,
        "Optional reading status for the entry.",
      ),
    },
    responses: {
      200: privateJsonResponse(
        schemas.readingListEntryResponse,
        "Saved reading-list entry.",
      ),
      400: privateJsonResponse(
        schemas.apiError,
        "Book ID or reading-list input is invalid.",
      ),
      401: privateJsonResponse(schemas.apiError, "Authentication is required."),
      404: privateJsonResponse(
        schemas.apiError,
        "Book does not exist or is archived.",
      ),
      413: jsonResponse(schemas.apiError, "Request body is too large."),
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/me/reading-list/{bookId}",
    tags: ["Engagement"],
    summary: "Remove a reading-list entry",
    description:
      "Removal is idempotent and remains allowed when the referenced book is archived.",
    security: cookieSecurity,
    request: {
      params: schemas.bookIdParams,
    },
    responses: {
      204: {
        description: "Reading-list entry removed or already absent.",
        headers: privateCacheHeaders,
      },
      400: privateJsonResponse(schemas.apiError, "Book ID is invalid."),
      401: privateJsonResponse(schemas.apiError, "Authentication is required."),
    },
  });

  const adminDescription =
    "Requires an authenticated LIBRARIAN session. Admin errors use the flat AdminError response.";
  const adminAuthenticationErrors = {
    401: privateJsonResponse(schemas.adminError, "Authentication is required."),
    403: privateJsonResponse(schemas.adminError, "LIBRARIAN role is required."),
  };

  registry.registerPath({
    method: "get",
    path: "/api/admin/books",
    tags: ["Librarian management"],
    summary: "List active or archived books",
    description: adminDescription,
    security: cookieSecurity,
    request: {
      query: schemas.adminStatusQuery,
    },
    responses: {
      200: privateJsonResponse(schemas.adminBooksResponse, "Books by status."),
      400: privateJsonResponse(schemas.adminError, "Status query is invalid."),
      ...adminAuthenticationErrors,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/admin/books",
    tags: ["Librarian management"],
    summary: "Create a book",
    description:
      `${adminDescription} Input requires one or more unique active genres and a valid unique ISBN.`,
    security: cookieSecurity,
    request: {
      body: requestBody(schemas.adminCreateBookInput, "Complete book input."),
    },
    responses: {
      201: privateJsonResponse(schemas.adminBookResponse, "Book created."),
      400: privateJsonResponse(
        schemas.adminError,
        "Book input or selected genres are invalid.",
      ),
      ...adminAuthenticationErrors,
      409: privateJsonResponse(schemas.adminError, "ISBN already exists."),
      413: privateJsonResponse(schemas.adminError, "Request body exceeds 1 MiB."),
    },
  });

  registry.registerPath({
    method: "put",
    path: "/api/admin/books/{bookId}",
    tags: ["Librarian management"],
    summary: "Replace a book",
    description:
      `${adminDescription} This full replacement preserves archive history and requires active genre selections.`,
    security: cookieSecurity,
    request: {
      params: schemas.adminBookIdParams,
      body: requestBody(schemas.adminUpdateBookInput, "Complete replacement book input."),
    },
    responses: {
      200: privateJsonResponse(schemas.adminBookResponse, "Book updated."),
      400: privateJsonResponse(
        schemas.adminError,
        "Book ID, input, or selected genres are invalid.",
      ),
      ...adminAuthenticationErrors,
      404: privateJsonResponse(schemas.adminError, "Book not found."),
      409: privateJsonResponse(schemas.adminError, "ISBN already exists."),
      413: privateJsonResponse(schemas.adminError, "Request body exceeds 1 MiB."),
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/admin/books/{bookId}",
    tags: ["Librarian management"],
    summary: "Archive a book",
    description:
      `${adminDescription} This is a soft archive; associations and historical reading-list data are preserved.`,
    security: cookieSecurity,
    request: {
      params: schemas.adminBookIdParams,
    },
    responses: {
      200: privateJsonResponse(schemas.adminBookResponse, "Book archived."),
      400: privateJsonResponse(schemas.adminError, "Book ID is invalid."),
      ...adminAuthenticationErrors,
      404: privateJsonResponse(schemas.adminError, "Book not found."),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/admin/books/{bookId}/restore",
    tags: ["Librarian management"],
    summary: "Restore a book",
    description:
      `${adminDescription} Restoration preserves history and requires at least one associated active genre.`,
    security: cookieSecurity,
    request: {
      params: schemas.adminBookIdParams,
    },
    responses: {
      200: privateJsonResponse(schemas.adminBookResponse, "Book restored."),
      400: privateJsonResponse(schemas.adminError, "Book ID is invalid."),
      ...adminAuthenticationErrors,
      404: privateJsonResponse(schemas.adminError, "Book not found."),
      409: privateJsonResponse(
        schemas.adminError,
        "Book has no associated active genre.",
      ),
    },
  });

  registry.registerPath({
    method: "get",
    path: "/api/admin/genres",
    tags: ["Librarian management"],
    summary: "List active or archived genres",
    description: adminDescription,
    security: cookieSecurity,
    request: {
      query: schemas.adminStatusQuery,
    },
    responses: {
      200: privateJsonResponse(schemas.adminGenresResponse, "Genres by status."),
      400: privateJsonResponse(schemas.adminError, "Status query is invalid."),
      ...adminAuthenticationErrors,
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/admin/genres",
    tags: ["Librarian management"],
    summary: "Create a genre",
    description:
      `${adminDescription} Active genre names and slugs must be unique.`,
    security: cookieSecurity,
    request: {
      body: requestBody(schemas.adminCreateGenreInput, "Genre name and slug."),
    },
    responses: {
      201: privateJsonResponse(schemas.adminGenreResponse, "Genre created."),
      400: privateJsonResponse(schemas.adminError, "Genre input is invalid."),
      ...adminAuthenticationErrors,
      409: privateJsonResponse(
        schemas.adminError,
        "Active genre name or slug already exists.",
      ),
      413: privateJsonResponse(schemas.adminError, "Request body exceeds 1 MiB."),
    },
  });

  registry.registerPath({
    method: "put",
    path: "/api/admin/genres/{genreId}",
    tags: ["Librarian management"],
    summary: "Replace a genre",
    description:
      `${adminDescription} This full replacement preserves archive history and associations.`,
    security: cookieSecurity,
    request: {
      params: schemas.adminGenreIdParams,
      body: requestBody(schemas.adminUpdateGenreInput, "Replacement name and slug."),
    },
    responses: {
      200: privateJsonResponse(schemas.adminGenreResponse, "Genre updated."),
      400: privateJsonResponse(
        schemas.adminError,
        "Genre ID or input is invalid.",
      ),
      ...adminAuthenticationErrors,
      404: privateJsonResponse(schemas.adminError, "Genre not found."),
      409: privateJsonResponse(
        schemas.adminError,
        "Active genre name or slug already exists.",
      ),
      413: privateJsonResponse(schemas.adminError, "Request body exceeds 1 MiB."),
    },
  });

  registry.registerPath({
    method: "delete",
    path: "/api/admin/genres/{genreId}",
    tags: ["Librarian management"],
    summary: "Archive a genre",
    description:
      `${adminDescription} This is a soft archive; associations are preserved. A genre cannot be archived when it is an active book's sole active genre.`,
    security: cookieSecurity,
    request: {
      params: schemas.adminGenreIdParams,
    },
    responses: {
      200: privateJsonResponse(schemas.adminGenreResponse, "Genre archived."),
      400: privateJsonResponse(schemas.adminError, "Genre ID is invalid."),
      ...adminAuthenticationErrors,
      404: privateJsonResponse(schemas.adminError, "Genre not found."),
      409: privateJsonResponse(
        schemas.adminError,
        "Genre is the sole active genre for an active book.",
      ),
    },
  });

  registry.registerPath({
    method: "post",
    path: "/api/admin/genres/{genreId}/restore",
    tags: ["Librarian management"],
    summary: "Restore a genre",
    description:
      `${adminDescription} Restoration preserves associations and history.`,
    security: cookieSecurity,
    request: {
      params: schemas.adminGenreIdParams,
    },
    responses: {
      200: privateJsonResponse(schemas.adminGenreResponse, "Genre restored."),
      400: privateJsonResponse(schemas.adminError, "Genre ID is invalid."),
      ...adminAuthenticationErrors,
      404: privateJsonResponse(schemas.adminError, "Genre not found."),
      409: privateJsonResponse(
        schemas.adminError,
        "Active genre name or slug already exists.",
      ),
    },
  });

  const document = new OpenApiGeneratorV3(
    registry.definitions,
  ).generateDocument({
    openapi: "3.0.3",
    info: {
      title: "Amazon 2.0 API",
      version: "1.0.0",
      description:
        "Public discovery, authenticated reader catalogue and engagement, and librarian-only management endpoints.",
    },
    servers: [{ url: "/", description: "Current API host" }],
    tags: [
      { name: "System" },
      { name: "Authentication" },
      { name: "Discovery" },
      { name: "Catalogue" },
      { name: "Engagement" },
      { name: "Librarian management" },
    ],
  });

  const loginSchema = document.components?.schemas?.LoginInput;
  if (loginSchema !== undefined && !("$ref" in loginSchema)) {
    const passwordSchema = loginSchema.properties?.password;
    if (passwordSchema !== undefined && !("$ref" in passwordSchema)) {
      passwordSchema.format = "password";
      passwordSchema.writeOnly = true;
      delete passwordSchema.example;
      delete passwordSchema.default;
    }
  }

  return document;
}

export const openApiDocument = createOpenApiDocument();
