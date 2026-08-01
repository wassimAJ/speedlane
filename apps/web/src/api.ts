import { apiErrorResponseSchema, type ApiErrorResponse } from "@amazon-2/contracts";

interface Schema<T> {
  parse(value: unknown): T;
}

export class ApiResponseError extends Error {
  readonly status: number;
  readonly apiError: ApiErrorResponse | null;

  constructor(status: number, apiError: ApiErrorResponse | null) {
    super(apiError?.error.message ?? "The request could not be completed.");
    this.name = "ApiResponseError";
    this.status = status;
    this.apiError = apiError;
  }
}

async function readPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return null;
  }

  return response.json();
}

export async function requestJson<T>(
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
    const parsedError = apiErrorResponseSchema.safeParse(payload);
    throw new ApiResponseError(
      response.status,
      parsedError.success ? parsedError.data : null,
    );
  }

  return schema.parse(payload);
}

export async function requestEmpty(
  url: string,
  init: RequestInit = {},
): Promise<void> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...init.headers,
    },
  });

  if (!response.ok) {
    const payload = await readPayload(response);
    const parsedError = apiErrorResponseSchema.safeParse(payload);
    throw new ApiResponseError(
      response.status,
      parsedError.success ? parsedError.data : null,
    );
  }
}

export function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiResponseError && error.status === 401;
}
