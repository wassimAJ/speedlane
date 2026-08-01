import {
  apiErrorResponseSchema,
  type ApiErrorCode,
} from "@amazon-2/contracts";
import type { ErrorRequestHandler, NextFunction, Request, Response } from "express";

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function notFoundHandler(
  _request: Request,
  _response: Response,
  next: NextFunction,
) {
  next(new HttpError(404, "NOT_FOUND", "Route not found."));
}

function isMalformedJsonError(error: unknown): error is SyntaxError & { status: number } {
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

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) => {
  let statusCode = 500;
  let code: ApiErrorCode = "INTERNAL_ERROR";
  let message = "Internal server error.";

  if (error instanceof HttpError) {
    statusCode = error.statusCode;
    code = error.code;
    message = error.message;
  } else if (isMalformedJsonError(error)) {
    statusCode = 400;
    code = "INVALID_REQUEST";
    message = "Request body must be valid JSON.";
  } else if (isPayloadTooLargeError(error)) {
    statusCode = 413;
    code = "INVALID_REQUEST";
    message = "Request body is too large.";
  } else {
    console.error("Unhandled API error", error);
  }

  response.status(statusCode).json(
    apiErrorResponseSchema.parse({
      error: { code, message },
    }),
  );
};
