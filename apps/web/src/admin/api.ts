import {
  adminBookInputSchema,
  adminBookResponseSchema,
  adminBooksResponseSchema,
  adminErrorResponseSchema,
  adminGenreInputSchema,
  adminGenreResponseSchema,
  adminGenresResponseSchema,
  adminStatusQuerySchema,
  type AdminBook,
  type AdminBookInput,
  type AdminGenre,
  type AdminGenreInput,
  type AdminRecordStatus,
} from "@amazon-2/contracts";

interface Schema<T> {
  parse(value: unknown): T;
}

export class AdminResponseError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdminResponseError";
    this.status = status;
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ? response.json() : null;
}

async function requestAdminJson<T>(
  url: string,
  schema: Schema<T>,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });
  const payload = await readPayload(response);

  if (!response.ok) {
    const parsedError = adminErrorResponseSchema.safeParse(payload);
    throw new AdminResponseError(
      response.status,
      parsedError.success ? parsedError.data.error : "The request could not be completed.",
    );
  }

  return schema.parse(payload);
}

function statusQuery(status: AdminRecordStatus) {
  const query = adminStatusQuerySchema.parse({ status });
  return new URLSearchParams(query).toString();
}

function jsonBody(input: unknown): RequestInit {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  };
}

export async function getAdminBooks(status: AdminRecordStatus): Promise<AdminBook[]> {
  const response = await requestAdminJson(
    `/api/admin/books?${statusQuery(status)}`,
    adminBooksResponseSchema,
  );
  return response.books;
}

export async function createAdminBook(input: AdminBookInput): Promise<AdminBook> {
  const parsed = adminBookInputSchema.parse(input);
  const response = await requestAdminJson("/api/admin/books", adminBookResponseSchema, {
    method: "POST",
    ...jsonBody(parsed),
  });
  return response.book;
}

export async function updateAdminBook(
  bookId: string,
  input: AdminBookInput,
): Promise<AdminBook> {
  const parsed = adminBookInputSchema.parse(input);
  const response = await requestAdminJson(
    `/api/admin/books/${bookId}`,
    adminBookResponseSchema,
    { method: "PUT", ...jsonBody(parsed) },
  );
  return response.book;
}

export async function archiveAdminBook(bookId: string): Promise<AdminBook> {
  const response = await requestAdminJson(
    `/api/admin/books/${bookId}`,
    adminBookResponseSchema,
    { method: "DELETE" },
  );
  return response.book;
}

export async function restoreAdminBook(bookId: string): Promise<AdminBook> {
  const response = await requestAdminJson(
    `/api/admin/books/${bookId}/restore`,
    adminBookResponseSchema,
    { method: "POST" },
  );
  return response.book;
}

export async function getAdminGenres(status: AdminRecordStatus): Promise<AdminGenre[]> {
  const response = await requestAdminJson(
    `/api/admin/genres?${statusQuery(status)}`,
    adminGenresResponseSchema,
  );
  return response.genres;
}

export async function createAdminGenre(input: AdminGenreInput): Promise<AdminGenre> {
  const parsed = adminGenreInputSchema.parse(input);
  const response = await requestAdminJson("/api/admin/genres", adminGenreResponseSchema, {
    method: "POST",
    ...jsonBody(parsed),
  });
  return response.genre;
}

export async function updateAdminGenre(
  genreId: string,
  input: AdminGenreInput,
): Promise<AdminGenre> {
  const parsed = adminGenreInputSchema.parse(input);
  const response = await requestAdminJson(
    `/api/admin/genres/${genreId}`,
    adminGenreResponseSchema,
    { method: "PUT", ...jsonBody(parsed) },
  );
  return response.genre;
}

export async function archiveAdminGenre(genreId: string): Promise<AdminGenre> {
  const response = await requestAdminJson(
    `/api/admin/genres/${genreId}`,
    adminGenreResponseSchema,
    { method: "DELETE" },
  );
  return response.genre;
}

export async function restoreAdminGenre(genreId: string): Promise<AdminGenre> {
  const response = await requestAdminJson(
    `/api/admin/genres/${genreId}/restore`,
    adminGenreResponseSchema,
    { method: "POST" },
  );
  return response.genre;
}
