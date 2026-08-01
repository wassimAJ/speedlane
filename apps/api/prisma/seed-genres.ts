import type { PrismaClient } from "@prisma/client";

const seededGenreDefinitions = [
  ["Fiction", "fiction"],
  ["Mystery", "mystery"],
  ["Science Fiction", "science-fiction"],
  ["Fantasy", "fantasy"],
  ["Romance", "romance"],
  ["Historical Fiction", "historical-fiction"],
  ["Biography", "biography"],
  ["History", "history"],
  ["Science", "science"],
  ["Philosophy", "philosophy"],
  ["Poetry", "poetry"],
  ["Graphic Novels", "graphic-novels"],
] as const;

function seededGenreId(index: number) {
  return `10000000-0000-4000-8000-${(index + 1)
    .toString()
    .padStart(12, "0")}`;
}

export const SEEDED_GENRES = seededGenreDefinitions.map(
  ([name, slug], index) => {
    const createdAt = new Date(Date.UTC(2023, 0, index + 1, 12));

    return {
      id: seededGenreId(index),
      name,
      slug,
      createdAt,
    };
  },
);

export type SeededGenreReconciliation =
  | {
      kind: "reconciled";
      genreId: string;
    }
  | {
      kind: "preserved_active_conflict";
      genreId: string;
      activeConflictGenreId: string;
    };

type SeedGenreClient = Pick<PrismaClient, "genre">;

async function reconcileSeededGenre(
  prisma: SeedGenreClient,
  seed: (typeof SEEDED_GENRES)[number],
): Promise<SeededGenreReconciliation> {
  const existing = await prisma.genre.findUnique({
    where: { id: seed.id },
    select: { id: true },
  });

  if (existing !== null) {
    const activeConflict = await prisma.genre.findFirst({
      where: {
        archivedAt: null,
        id: { not: seed.id },
        OR: [
          { name: { equals: seed.name, mode: "insensitive" } },
          { slug: { equals: seed.slug, mode: "insensitive" } },
        ],
      },
      select: { id: true },
    });

    if (activeConflict !== null) {
      return {
        kind: "preserved_active_conflict",
        genreId: seed.id,
        activeConflictGenreId: activeConflict.id,
      };
    }
  }

  await prisma.genre.upsert({
    where: { id: seed.id },
    create: {
      ...seed,
      archivedAt: null,
      updatedAt: seed.createdAt,
    },
    update: {
      name: seed.name,
      slug: seed.slug,
      archivedAt: null,
      createdAt: seed.createdAt,
      updatedAt: seed.createdAt,
    },
  });

  return { kind: "reconciled", genreId: seed.id };
}

export async function reconcileSeededGenres(
  prisma: SeedGenreClient,
): Promise<SeededGenreReconciliation[]> {
  const results: SeededGenreReconciliation[] = [];

  for (const seed of SEEDED_GENRES) {
    results.push(await reconcileSeededGenre(prisma, seed));
  }

  return results;
}
