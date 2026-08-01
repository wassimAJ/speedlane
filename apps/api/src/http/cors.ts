import type { RequestHandler } from "express";

import { HttpError } from "./errors.js";

const ALLOWED_METHODS = "GET,POST,PUT,DELETE,OPTIONS";
const ALLOWED_HEADERS = "Content-Type";

export function createCorsMiddleware(allowedOrigin: string): RequestHandler {
  return (request, response, next) => {
    const requestOrigin = request.get("origin");

    if (requestOrigin === undefined) {
      next();
      return;
    }

    if (requestOrigin !== allowedOrigin) {
      next(new HttpError(403, "FORBIDDEN", "Origin is not allowed."));
      return;
    }

    response.vary("Origin");
    response.set({
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": ALLOWED_METHODS,
      "Access-Control-Allow-Headers": ALLOWED_HEADERS,
    });

    if (request.method === "OPTIONS") {
      response.sendStatus(204);
      return;
    }

    next();
  };
}
