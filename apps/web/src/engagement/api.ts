import {
  favouriteGenreIdsInputSchema,
  favouriteGenresResponseSchema,
  forYourShelvesResponseSchema,
  readingListEntryResponseSchema,
  readingListResponseSchema,
  readingListUpdateInputSchema,
  type FavouriteGenreIdsInput,
  type FavouriteGenresResponse,
  type ForYourShelvesResponse,
  type ReadingListEntryResponse,
  type ReadingListResponse,
  type ReadingListUpdateInput,
} from "@amazon-2/contracts";

import { requestEmpty, requestJson } from "../api";

const JSON_HEADERS = { "Content-Type": "application/json" };

export function getFavouriteGenres(signal?: AbortSignal): Promise<FavouriteGenresResponse> {
  return requestJson("/api/me/favourite-genres", favouriteGenresResponseSchema, { signal });
}

export function replaceFavouriteGenres(
  input: FavouriteGenreIdsInput,
): Promise<FavouriteGenresResponse> {
  const body = favouriteGenreIdsInputSchema.parse(input);
  return requestJson("/api/me/favourite-genres", favouriteGenresResponseSchema, {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
}

export function getForYourShelves(signal?: AbortSignal): Promise<ForYourShelvesResponse> {
  return requestJson("/api/me/for-your-shelves", forYourShelvesResponseSchema, { signal });
}

export function getReadingList(signal?: AbortSignal): Promise<ReadingListResponse> {
  return requestJson("/api/me/reading-list", readingListResponseSchema, { signal });
}

export function upsertReadingListEntry(
  bookId: string,
  input: ReadingListUpdateInput,
): Promise<ReadingListEntryResponse> {
  const body = readingListUpdateInputSchema.parse(input);
  return requestJson(
    `/api/me/reading-list/${encodeURIComponent(bookId)}`,
    readingListEntryResponseSchema,
    {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    },
  );
}

export function removeReadingListEntry(bookId: string): Promise<void> {
  return requestEmpty(`/api/me/reading-list/${encodeURIComponent(bookId)}`, {
    method: "DELETE",
  });
}
