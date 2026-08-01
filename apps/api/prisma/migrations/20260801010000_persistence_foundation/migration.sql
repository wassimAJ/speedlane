-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('READER', 'LIBRARIAN');

-- CreateEnum
CREATE TYPE "ReadingStatus" AS ENUM ('WANT_TO_READ', 'READING', 'FINISHED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'READER',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "title" VARCHAR(240) NOT NULL,
    "subtitle" VARCHAR(320),
    "author" VARCHAR(200) NOT NULL,
    "synopsis" TEXT NOT NULL,
    "isbn" VARCHAR(17) NOT NULL,
    "publication_year" INTEGER NOT NULL,
    "page_count" INTEGER NOT NULL,
    "language" VARCHAR(80) NOT NULL,
    "rating" DECIMAL(2,1) NOT NULL,
    "cover_seed" VARCHAR(120) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "books_publication_year_check" CHECK ("publication_year" BETWEEN 1 AND 9999),
    CONSTRAINT "books_page_count_check" CHECK ("page_count" > 0),
    CONSTRAINT "books_rating_check" CHECK ("rating" BETWEEN 0 AND 5)
);

-- CreateTable
CREATE TABLE "genres" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_genres" (
    "book_id" UUID NOT NULL,
    "genre_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_genres_pkey" PRIMARY KEY ("book_id", "genre_id")
);

-- CreateTable
CREATE TABLE "favourite_genres" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "genre_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favourite_genres_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "favourite_genres_position_check" CHECK ("position" >= 1)
);

-- CreateTable
CREATE TABLE "reading_list_entries" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "status" "ReadingStatus" NOT NULL DEFAULT 'WANT_TO_READ',
    "removed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reading_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "books_isbn_key" ON "books"("isbn");

-- CreateIndex
CREATE INDEX "books_archive_created_id_idx" ON "books"("archived_at", "created_at", "id");

-- CreateIndex
CREATE INDEX "books_archive_year_id_idx" ON "books"("archived_at", "publication_year", "id");

-- Active catalogue sort paths avoid indexing archived rows while retaining the
-- complete archive in the base tables.
CREATE INDEX "books_active_newest_idx" ON "books"("created_at" DESC, "id") WHERE "archived_at" IS NULL;
CREATE INDEX "books_active_title_idx" ON "books"("title", "id") WHERE "archived_at" IS NULL;
CREATE INDEX "books_active_rating_idx" ON "books"("rating" DESC, "id") WHERE "archived_at" IS NULL;

-- PostgreSQL trigram indexes support the specified case-insensitive partial
-- title/author search without an external search service.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE INDEX "books_title_search_idx" ON "books" USING GIN (LOWER("title") gin_trgm_ops);
CREATE INDEX "books_author_search_idx" ON "books" USING GIN (LOWER("author") gin_trgm_ops);

-- CreateIndex
CREATE INDEX "genres_archive_name_id_idx" ON "genres"("archived_at", "name", "id");

-- Active-only, case-insensitive uniqueness lets an archived taxonomy term
-- remain historical without reserving its name or slug forever.
CREATE UNIQUE INDEX "genres_active_name_key" ON "genres"(LOWER("name")) WHERE "archived_at" IS NULL;
CREATE UNIQUE INDEX "genres_active_slug_key" ON "genres"(LOWER("slug")) WHERE "archived_at" IS NULL;

-- CreateIndex
CREATE INDEX "book_genres_genre_id_book_id_idx" ON "book_genres"("genre_id", "book_id");

-- CreateIndex
CREATE UNIQUE INDEX "favourite_genres_user_id_genre_id_key" ON "favourite_genres"("user_id", "genre_id");

-- CreateIndex
CREATE INDEX "favourite_genres_user_id_removed_at_position_idx" ON "favourite_genres"("user_id", "removed_at", "position");

-- CreateIndex
CREATE INDEX "favourite_genres_genre_id_removed_at_idx" ON "favourite_genres"("genre_id", "removed_at");

-- A reader cannot have two visible favourites at the same position. Removed
-- rows keep their old position and do not block a replacement.
CREATE UNIQUE INDEX "favourite_genres_active_user_position_key" ON "favourite_genres"("user_id", "position") WHERE "removed_at" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "reading_list_entries_user_id_book_id_key" ON "reading_list_entries"("user_id", "book_id");

-- CreateIndex
CREATE INDEX "reading_list_entries_user_id_removed_at_status_updated_at_idx" ON "reading_list_entries"("user_id", "removed_at", "status", "updated_at");

-- CreateIndex
CREATE INDEX "reading_list_entries_book_id_removed_at_idx" ON "reading_list_entries"("book_id", "removed_at");

-- AddForeignKey
ALTER TABLE "book_genres" ADD CONSTRAINT "book_genres_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_genres" ADD CONSTRAINT "book_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourite_genres" ADD CONSTRAINT "favourite_genres_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favourite_genres" ADD CONSTRAINT "favourite_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_list_entries" ADD CONSTRAINT "reading_list_entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_list_entries" ADD CONSTRAINT "reading_list_entries_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
