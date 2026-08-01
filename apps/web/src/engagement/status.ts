import type { ReadingListStatus } from "@amazon-2/contracts";

export const READING_LIST_STATUS_ORDER: ReadingListStatus[] = [
  "WANT_TO_READ",
  "READING",
  "FINISHED",
];

export const READING_LIST_STATUS_LABELS: Record<ReadingListStatus, string> = {
  WANT_TO_READ: "Want to read",
  READING: "Reading",
  FINISHED: "Finished",
};
