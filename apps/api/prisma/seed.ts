import { scryptSync } from "node:crypto";

import { Prisma, PrismaClient, UserRole } from "@prisma/client";

import { reconcileSeededGenres, SEEDED_GENRES } from "./seed-genres.js";

const prisma = new PrismaClient();

const BOOK_COUNT = 240;

const demoUsers = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    email: "reader@amazon2.local",
    displayName: "Riley Reader",
    password: "ReaderDemo123!",
    salt: "5ca7371d2bf88a7ba0b246d2fd6147b1",
    role: UserRole.READER,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "librarian@amazon2.local",
    displayName: "Morgan Librarian",
    password: "LibrarianDemo123!",
    salt: "1e3cc494f174fd479912f7a5bb6fed90",
    role: UserRole.LIBRARIAN,
  },
] as const;

const titleAdjectives = [
  "Amber",
  "Borrowed",
  "Clockwork",
  "Distant",
  "Electric",
  "Forgotten",
  "Golden",
  "Hidden",
  "Inkbound",
  "Jade",
  "Kindred",
  "Last",
  "Midnight",
  "Northern",
  "Paper",
  "Quiet",
  "Restless",
  "Silver",
  "Tidal",
  "Unwritten",
] as const;

const titleSubjects = [
  "Archive",
  "Atlas",
  "Comet",
  "Garden",
  "Harbour",
  "Lantern",
  "Map",
  "Orchard",
  "Paradox",
  "River",
  "Signal",
  "Voyage",
] as const;

const authorFirstNames = [
  "Ada",
  "Amir",
  "Bea",
  "Clara",
  "Diego",
  "Elena",
  "Farah",
  "Hugo",
  "Imani",
  "Jonas",
  "Keiko",
  "Leila",
  "Mateo",
  "Nora",
  "Omar",
  "Priya",
  "Quinn",
  "Ravi",
  "Sofia",
  "Theo",
] as const;

const authorLastNames = [
  "Ashby",
  "Bell",
  "Chen",
  "Darzi",
  "Ellis",
  "Foster",
  "Gupta",
  "Haddad",
  "Ito",
  "Jensen",
  "Khan",
  "Laurent",
] as const;

const languages = ["English", "Arabic", "French", "Spanish"] as const;
const subtitles = [
  "Notes from a changing world",
  "A library of unlikely discoveries",
  "Stories for the long way home",
] as const;

function valueAt<T>(values: readonly T[], index: number, label: string): T {
  const value = values[index];

  if (value === undefined) {
    throw new Error(`Missing ${label} seed value at index ${index}.`);
  }

  return value;
}

function stableUuid(namespace: number, value: number) {
  return `${namespace.toString(16)}0000000-0000-4000-8000-${value
    .toString()
    .padStart(12, "0")}`;
}

function passwordHash(password: string, saltHex: string) {
  const workFactor = 16_384;
  const blockSize = 8;
  const parallelization = 1;
  const derivedKey = scryptSync(password, Buffer.from(saltHex, "hex"), 64, {
    N: workFactor,
    r: blockSize,
    p: parallelization,
  });

  return `scrypt$${workFactor}$${blockSize}$${parallelization}$${saltHex}$${derivedKey.toString("hex")}`;
}

function isbnFor(index: number) {
  const firstTwelveDigits = `978194${(index + 1).toString().padStart(6, "0")}`;
  const checksumTotal = [...firstTwelveDigits].reduce(
    (total, digit, digitIndex) => total + Number(digit) * (digitIndex % 2 === 0 ? 1 : 3),
    0,
  );
  const checkDigit = (10 - (checksumTotal % 10)) % 10;

  return `${firstTwelveDigits}${checkDigit}`;
}

function genreIdsFor(index: number) {
  const genreIndexes = new Set([
    index % SEEDED_GENRES.length,
    (index * 5 + 3) % SEEDED_GENRES.length,
  ]);

  if (index % 4 === 0) {
    genreIndexes.add((index * 7 + 5) % SEEDED_GENRES.length);
  }

  return [...genreIndexes].map(
    (genreIndex) =>
      valueAt(SEEDED_GENRES, genreIndex, "genre").id,
  );
}

function bookFor(index: number) {
  const adjective = valueAt(
    titleAdjectives,
    Math.floor(index / titleSubjects.length),
    "title adjective",
  );
  const subject = valueAt(titleSubjects, index % titleSubjects.length, "title subject");
  const authorFirstName = valueAt(
    authorFirstNames,
    index % authorFirstNames.length,
    "author first name",
  );
  const authorLastName = valueAt(
    authorLastNames,
    Math.floor(index / authorFirstNames.length),
    "author last name",
  );
  const publicationYear = 1980 + ((index * 7) % 46);
  const rating = 3 + ((index * 3) % 21) / 10;
  const createdAt = new Date(Date.UTC(2024, 0, index + 1, 12));

  return {
    id: stableUuid(2, index + 1),
    title: `The ${adjective} ${subject}`,
    subtitle:
      index % 3 === 0 ? valueAt(subtitles, index % subtitles.length, "subtitle") : null,
    author: `${authorFirstName} ${authorLastName}`,
    synopsis: `A carefully catalogued story of ${adjective.toLowerCase()} ideas, the ${subject.toLowerCase()}, and the people who discover what its pages have been keeping. Volume ${index + 1} in the Amazon 2.0 seed collection.`,
    isbn: isbnFor(index),
    publicationYear,
    pageCount: 144 + ((index * 37) % 481),
    language: valueAt(languages, index % languages.length, "language"),
    rating: new Prisma.Decimal(rating.toFixed(1)),
    coverSeed: `amazon-2-cover-${(index + 1).toString().padStart(3, "0")}`,
    archivedAt: null,
    createdAt,
    updatedAt: createdAt,
  };
}

async function main() {
  for (const user of demoUsers) {
    const data = {
      email: user.email,
      displayName: user.displayName,
      passwordHash: passwordHash(user.password, user.salt),
      role: user.role,
    };

    await prisma.user.upsert({
      where: { id: user.id },
      create: { id: user.id, ...data },
      update: data,
    });
  }

  await reconcileSeededGenres(prisma);

  for (let index = 0; index < BOOK_COUNT; index += 1) {
    const book = bookFor(index);

    await prisma.book.upsert({
      where: { id: book.id },
      create: book,
      update: book,
    });

    await prisma.bookGenre.createMany({
      data: genreIdsFor(index).map((genreId) => ({
        bookId: book.id,
        genreId,
        assignedAt: book.createdAt,
      })),
      skipDuplicates: true,
    });
  }

  const [activeBooks, activeGenres, users] = await Promise.all([
    prisma.book.count({ where: { archivedAt: null } }),
    prisma.genre.count({ where: { archivedAt: null } }),
    prisma.user.count(),
  ]);

  console.info(
    `Prisma seed completed: ${activeBooks} active books, ${activeGenres} active genres, ${users} users.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Prisma seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
