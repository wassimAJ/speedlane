import { healthResponseSchema } from "@amazon-2/contracts";
import express, { type NextFunction, type Request, type Response } from "express";

export interface DatabaseHealthcheck {
  check(): Promise<void>;
}

class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function notFoundHandler(_request: Request, _response: Response, next: NextFunction) {
  next(new HttpError(404, "Route not found."));
}

function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  if (error instanceof HttpError) {
    response.status(error.statusCode).json({ error: error.message });
    return;
  }

  console.error("Unhandled API error", error);
  response.status(500).json({ error: "Internal server error." });
}

export function createApp(database: DatabaseHealthcheck) {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", async (_request, response, next) => {
    try {
      await database.check();
      const body = healthResponseSchema.parse({
        status: "ok",
        service: "api",
        database: "connected",
        timestamp: new Date().toISOString(),
      });

      response.status(200).json(body);
    } catch (error: unknown) {
      next(new HttpError(503, "Database is unavailable."));
      console.error("Health check failed", error);
    }
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
