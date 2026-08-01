import { healthResponseSchema } from "@amazon-2/contracts";
import { Router } from "express";

import { HttpError } from "../http/errors.js";

export interface HealthStore {
  check(): Promise<void>;
}

export function createHealthRouter(store: HealthStore) {
  const router = Router();

  router.get("/health", async (_request, response, next) => {
    try {
      await store.check();
      const body = healthResponseSchema.parse({
        status: "ok",
        service: "api",
        database: "connected",
        timestamp: new Date().toISOString(),
      });

      response.status(200).json(body);
    } catch (error: unknown) {
      next(new HttpError(503, "SERVICE_UNAVAILABLE", "Database is unavailable."));
      console.error("Health check failed", error);
    }
  });

  return router;
}
