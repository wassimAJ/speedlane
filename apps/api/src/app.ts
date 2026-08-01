import express from "express";

import {
  adminErrorHandler,
  adminNotFoundHandler,
  createAdminRouter,
  type AdminStore,
} from "./admin/routes.js";
import {
  createAccountRouter,
  type AccountRouterConfig,
  type AccountStore,
} from "./account/routes.js";
import {
  createAuthRouter,
  type AuthStore,
  type AuthUserRecord,
} from "./auth/routes.js";
import { createCatalogueRouter, type CatalogueStore } from "./catalogue/routes.js";
import { createDiscoveryRouter, type DiscoveryStore } from "./discovery/routes.js";
import { createEngagementRouter, type EngagementStore } from "./engagement/routes.js";
import { createHealthRouter, type HealthStore } from "./health/routes.js";
import { createCorsMiddleware } from "./http/cors.js";
import { errorHandler, notFoundHandler } from "./http/errors.js";
import { createOpenApiRouter } from "./openapi/routes.js";

export interface DatabaseHealthcheck extends HealthStore {}

export interface AppDatabase
  extends DatabaseHealthcheck,
    AdminStore,
    AuthStore,
    CatalogueStore,
    DiscoveryStore,
    EngagementStore {}

export type { AuthUserRecord };

export interface AppConfig {
  corsOrigin: string;
  jwtSecret: string;
  sessionTtlSeconds: number;
  secureCookie: boolean;
}

export interface AppDependencies {
  account?: {
    store: AccountStore;
    mailDelivery?: AccountRouterConfig["mailDelivery"];
    now?: AccountRouterConfig["now"];
    createChallenge?: AccountRouterConfig["createChallenge"];
    schedule?: AccountRouterConfig["schedule"];
  };
}

export function createApp(
  database: AppDatabase,
  config: AppConfig,
  dependencies: AppDependencies = {},
) {
  const app = express();
  const tokenConfig = {
    secret: config.jwtSecret,
    ttlSeconds: config.sessionTtlSeconds,
  };

  app.disable("x-powered-by");
  app.use(createCorsMiddleware(config.corsOrigin));
  app.use("/api", createOpenApiRouter());
  app.use(express.json({ limit: "1mb" }));

  app.use("/api", createHealthRouter(database));
  app.use("/api", createDiscoveryRouter(database));
  if (dependencies.account !== undefined) {
    app.use(
      "/api",
      createAccountRouter(dependencies.account.store, {
        cookie: {
          secure: config.secureCookie,
          ttlSeconds: config.sessionTtlSeconds,
        },
        token: tokenConfig,
        mailDelivery: dependencies.account.mailDelivery,
        now: dependencies.account.now,
        createChallenge: dependencies.account.createChallenge,
        schedule: dependencies.account.schedule,
      }),
    );
  }
  app.use(
    "/api/auth",
    createAuthRouter(database, {
      cookie: {
        secure: config.secureCookie,
        ttlSeconds: config.sessionTtlSeconds,
      },
      token: tokenConfig,
    }),
  );
  app.use("/api", createCatalogueRouter(database, tokenConfig));
  app.use("/api", createEngagementRouter(database, tokenConfig));
  app.use("/api/admin", createAdminRouter(database, tokenConfig));
  app.use("/api/admin", adminNotFoundHandler);

  app.use(adminErrorHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
