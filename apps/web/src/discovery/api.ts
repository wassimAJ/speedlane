import {
  discoveryResponseSchema,
  type PublicBookPreview,
} from "@amazon-2/contracts";

export async function getPublicDiscovery(signal?: AbortSignal): Promise<PublicBookPreview[]> {
  const response = await fetch("/api/discover", {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error("Public discovery request failed.");
  }

  return discoveryResponseSchema.parse(await response.json()).books;
}
