import { Router } from "express";
import swaggerUi from "swagger-ui-express";

import { openApiDocument } from "./document.js";

export function createOpenApiRouter() {
  const router = Router();

  router.get("/openapi.json", (_request, response) => {
    response.status(200).json(openApiDocument);
  });

  router.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "Amazon 2.0 API documentation",
      explorer: false,
    }),
  );

  return router;
}
