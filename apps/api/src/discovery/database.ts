import { Prisma, type PrismaClient } from "@prisma/client";
import {
  PUBLIC_DISCOVERY_LIMIT,
  publicBookPreviewSchema,
  type PublicBookPreview,
} from "@amazon-2/contracts";

const publicDiscoveryQuery = Prisma.validator<Prisma.BookFindManyArgs>()({
  where: {
    archivedAt: null,
  },
  orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  take: PUBLIC_DISCOVERY_LIMIT,
  select: {
    coverSeed: true,
    title: true,
    author: true,
    genres: {
      where: {
        genre: {
          archivedAt: null,
        },
      },
      orderBy: [{ genre: { name: "asc" } }, { genreId: "asc" }],
      select: {
        genre: {
          select: {
            name: true,
          },
        },
      },
    },
  },
});

export async function findPublicBookPreviews(
  prisma: PrismaClient,
): Promise<PublicBookPreview[]> {
  const books = await prisma.book.findMany(publicDiscoveryQuery);

  return books.map((book) =>
    publicBookPreviewSchema.parse({
      coverSeed: book.coverSeed,
      title: book.title,
      author: book.author,
      genres: book.genres.map(({ genre }) => genre.name),
    }),
  );
}
