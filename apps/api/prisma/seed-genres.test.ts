import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { reconcileSeededGenres, SEEDED_GENRES } from "./seed-genres.js";

interface GenreRow {
  id: string;
  name: string;
  slug: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function genreSeedStore() {
  const rows = new Map<string, GenreRow>();
  const findUnique = vi.fn(
    async ({ where }: { where: { id: string } }) => {
      const row = rows.get(where.id);
      return row === undefined ? null : { id: row.id };
    },
  );
  const findFirst = vi.fn(
    async ({ where }: {
      where: {
        id: { not: string };
        OR: [
          { name: { equals: string; mode: "insensitive" } },
          { slug: { equals: string; mode: "insensitive" } },
        ];
      };
    }) => {
      const desiredName = where.OR[0].name.equals.toLowerCase();
      const desiredSlug = where.OR[1].slug.equals.toLowerCase();
      const conflict = [...rows.values()].find(
        (row) =>
          row.id !== where.id.not &&
          row.archivedAt === null &&
          (row.name.toLowerCase() === desiredName ||
            row.slug.toLowerCase() === desiredSlug),
      );

      return conflict === undefined ? null : { id: conflict.id };
    },
  );
  const upsert = vi.fn(
    async ({
      where,
      create,
      update,
    }: {
      where: { id: string };
      create: GenreRow;
      update: Omit<GenreRow, "id">;
    }) => {
      const existing = rows.get(where.id);
      const next =
        existing === undefined
          ? create
          : {
              ...existing,
              ...update,
            };
      const conflict = [...rows.values()].find(
        (row) =>
          row.id !== where.id &&
          row.archivedAt === null &&
          next.archivedAt === null &&
          (row.name.toLowerCase() === next.name.toLowerCase() ||
            row.slug.toLowerCase() === next.slug.toLowerCase()),
      );

      if (conflict !== undefined) {
        throw new Error("Active genre uniqueness conflict.");
      }

      rows.set(where.id, next);
      return next;
    },
  );
  const prisma = {
    genre: {
      findUnique,
      findFirst,
      upsert,
    },
  } as unknown as Pick<PrismaClient, "genre">;

  return { prisma, rows, upsert };
}

describe("seeded genre reconciliation", () => {
  it("bootstraps twelve active genres and repeats deterministically", async () => {
    const store = genreSeedStore();

    const first = await reconcileSeededGenres(store.prisma);
    const firstRows = [...store.rows.values()];
    const second = await reconcileSeededGenres(store.prisma);

    expect(first).toHaveLength(12);
    expect(first.every(({ kind }) => kind === "reconciled")).toBe(true);
    expect(second).toEqual(first);
    expect(firstRows).toHaveLength(12);
    expect(firstRows.every(({ archivedAt }) => archivedAt === null)).toBe(true);
    expect([...store.rows.values()]).toEqual(firstRows);
    expect(store.upsert).toHaveBeenCalledTimes(24);
  });

  it("preserves an archived seed and an active librarian replacement on rerun", async () => {
    const store = genreSeedStore();
    await reconcileSeededGenres(store.prisma);

    const fictionSeed = SEEDED_GENRES[0];
    expect(fictionSeed).toBeDefined();
    if (fictionSeed === undefined) {
      return;
    }

    const archivedAt = new Date("2026-08-01T00:00:00.000Z");
    const original = store.rows.get(fictionSeed.id);
    expect(original).toBeDefined();
    if (original === undefined) {
      return;
    }

    store.rows.set(fictionSeed.id, { ...original, archivedAt });
    const replacement: GenreRow = {
      id: "90000000-0000-4000-8000-000000000001",
      name: fictionSeed.name,
      slug: fictionSeed.slug,
      archivedAt: null,
      createdAt: new Date("2026-08-01T01:00:00.000Z"),
      updatedAt: new Date("2026-08-01T01:00:00.000Z"),
    };
    store.rows.set(replacement.id, replacement);
    store.upsert.mockClear();

    const results = await reconcileSeededGenres(store.prisma);

    expect(results[0]).toEqual({
      kind: "preserved_active_conflict",
      genreId: fictionSeed.id,
      activeConflictGenreId: replacement.id,
    });
    expect(store.rows.get(fictionSeed.id)).toEqual({ ...original, archivedAt });
    expect(store.rows.get(replacement.id)).toEqual(replacement);
    expect(
      [...store.rows.values()].filter(({ archivedAt: value }) => value === null),
    ).toHaveLength(12);
    expect(store.upsert).toHaveBeenCalledTimes(11);
    expect(store.upsert).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: fictionSeed.id } }),
    );
  });
});
