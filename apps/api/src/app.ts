import express from "express";

import { createAuthRouter, type AuthStore, type AuthUserRecord } from "./auth/routes.js";
import { createDiscoveryRouter, type DiscoveryStore } from "./discovery/routes.js";
import { createHealthRouter, type HealthStore } from "./health/routes.js";
import { createCorsMiddleware } from "./http/cors.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";

export interface DatabaseHealthcheck extends HealthStore {}

export interface AppDatabase extends DatabaseHealthcheck, AuthStore, DiscoveryStore {}

export type { AuthUserRecord };

export interface AppConfig {
  corsOrigin: string;
  jwtSecret: string;
  sessionTtlSeconds: number;
  secureCookie: boolean;
}

export function createApp(database: AppDatabase, config: AppConfig) {
  const app = express();

  app.disable("x-powered-by");
  app.use(createCorsMiddleware(config.corsOrigin));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", createHealthRouter(database));
  app.use("/api", createDiscoveryRouter(database));
  app.use(
    "/api/auth",
    createAuthRouter(database, {
      cookie: {
        secure: config.secureCookie,
        ttlSeconds: config.sessionTtlSeconds,
      },
      token: {
        secret: config.jwtSecret,
        ttlSeconds: config.sessionTtlSeconds,
      },
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
