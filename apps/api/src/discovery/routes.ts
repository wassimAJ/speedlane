import {
  discoveryResponseSchema,
  PUBLIC_DISCOVERY_LIMIT,
  type PublicBookPreview,
} from "@amazon-2/contracts";
import { Router } from "express";

export interface DiscoveryStore {
  findPublicBookPreviews(): Promise<PublicBookPreview[]>;
}

export function createDiscoveryRouter(store: DiscoveryStore) {
  const router = Router();

  router.get("/discover", async (_request, response, next) => {
    try {
      const books = await store.findPublicBookPreviews();
      const body = discoveryResponseSchema.parse({
        books: books.slice(0, PUBLIC_DISCOVERY_LIMIT),
      });

      response.status(200).json(body);
    } catch (error: unknown) {
      next(error);
    }
  });

  return router;
}
