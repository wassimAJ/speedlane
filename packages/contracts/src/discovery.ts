import { z } from "zod";

export const PUBLIC_DISCOVERY_LIMIT = 6;

export const publicBookPreviewSchema = z
  .object({
    coverSeed: z.string().min(1).max(120),
    title: z.string().min(1).max(240),
    author: z.string().min(1).max(200),
    genres: z.array(z.string().min(1).max(100)),
  })
  .strict();

export const discoveryResponseSchema = z
  .object({
    books: z.array(publicBookPreviewSchema).max(PUBLIC_DISCOVERY_LIMIT),
  })
  .strict();

export type PublicBookPreview = z.infer<typeof publicBookPreviewSchema>;
export type DiscoveryResponse = z.infer<typeof discoveryResponseSchema>;
