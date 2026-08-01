# Amazon 2.0

Amazon 2.0 is an independent, playful book-library demo for the Speedlane take-home challenge. It is not affiliated with Amazon and does not use Amazon branding or trade dress.

The completed demo includes a public discovery landing page, authenticated reader catalogue and engagement flows, a librarian Back Room, and public Swagger/OpenAPI documentation. PostgreSQL/Prisma persistence, deterministic seeds, cookie authentication, shared Zod contracts, and the responsive React application run together through Docker Compose.

## Product status

- Visitors can open the public landing page, see exactly six newest active book previews from `GET /api/discover`, read the independence statement, and continue to sign in.
- Readers can sign in and out, browse/search/filter/sort/paginate the active catalogue, open book details, save zero to five ordered favourite genres, receive at most six personalised **For your shelves** results, and manage **Want to read**, **Reading**, and **Finished** reading-list states. Soft-removed entries can be restored with their previous state; archived books remain as unavailable shelf history and can still be removed.
- Librarians have all reader capabilities plus the **Back Room**, with active and archived views for books and genres and create, edit, archive, and restore workflows. A genre cannot be archived while it is the sole active genre of an active book.

There is no public registration flow. Server-side user records own the `READER` and `LIBRARIAN` roles.

## Quick start

Prerequisites: Docker Desktop with Docker Compose v2. For local (non-Docker) development, use Node.js 22+ and pnpm 10+.

Copy the environment template, then replace `JWT_SECRET` with at least 32 random characters:

```sh
cp .env.example .env
# Edit .env: the supplied JWT_SECRET value is intentionally invalid.
docker compose up --build --detach
docker compose exec api pnpm --filter @amazon-2/api prisma:seed
```

Compose refuses to start with the placeholder secret. The API applies Prisma migrations automatically at startup; the explicit seed is idempotent and safe to repeat.

Verify the public API:

```sh
curl --fail http://localhost:3000/api/health
curl --fail http://localhost:3000/api/discover
```

Open the application at <http://localhost:5173>, Swagger UI at <http://localhost:3000/api/docs> or through the web proxy at <http://localhost:5173/api/docs>, and the OpenAPI JSON at <http://localhost:3000/api/openapi.json>. Stop the stack with `docker compose down`; add `--volumes` to remove the local database.

## Environment and local development

Docker Compose defaults to web `5173`, API `3000`, and PostgreSQL `5432`. The copied `.env` can override those ports, the trusted-local database credentials, cookie security, and the 900-second token lifetime. Never commit a real JWT secret or reuse demo database credentials outside this local environment.

For non-Docker API or Prisma commands, copy `apps/api/.env.example` to `apps/api/.env`, replace `JWT_SECRET`, and provide a reachable `DATABASE_URL`. A running PostgreSQL instance is required for development API startup, migrations, and seeding; Prisma client generation does not require a database connection.

The browser calls relative `/api` URLs with credentials included, and Vite proxies those requests to the API in local and Compose environments. The JWT remains in the server-set HTTP-only cookie and is never stored in React state, local storage, or session storage.

## Local commands

```sh
pnpm install
pnpm dev          # starts the API on :3000 and Vite on :5173
pnpm build        # production-builds contracts, API, and web
pnpm typecheck
pnpm test         # runs the API and web test suites
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## API and Swagger

The versionless API is under `/api`. Public routes are:

- `GET /api/health` checks PostgreSQL and returns the shared health contract.
- `GET /api/discover` is public and returns at most six newest active books. It orders equal creation timestamps by book ID ascending and exposes only `coverSeed`, `title`, `author`, and active genre names.
- `POST /api/auth/login` validates seeded credentials and sets a short-lived JWT in an HTTP-only cookie.
- `POST /api/auth/logout` idempotently expires the session cookie.
- `GET /api/openapi.json` returns the OpenAPI 3.0.3 document.
- `GET /api/docs` redirects once to the public Swagger UI at `/api/docs/`.

Authenticated reader routes are:

- `GET /api/auth/me` returns the authenticated user and requires a valid session cookie.
- `GET /api/books` requires the JWT cookie and returns active book summaries with pagination metadata.
- `GET /api/books/:bookId` requires the JWT cookie and returns one active book's reader-facing detail.
- `GET /api/genres` requires the JWT cookie and returns active genre summaries.
- `GET /api/me/favourite-genres` and `PUT /api/me/favourite-genres` read and replace the complete ordered selection of zero to five unique active genres.
- `GET /api/me/for-your-shelves` returns at most six active personalised books in preference order, then newest and book ID, excluding books already on the visible reading list.
- `GET /api/me/reading-list` returns visible entries, including safe unavailable previews for books archived after they were saved.
- `PUT /api/me/reading-list/:bookId` adds, restores, or updates one entry per user/book; omitting `status` creates a new entry as `WANT_TO_READ` or restores its previous state.
- `DELETE /api/me/reading-list/:bookId` idempotently soft-removes an entry, including an archived book's entry.

Librarian-only routes are:

- `GET /api/admin/books` and `POST /api/admin/books` list active/archived books and create books.
- `PUT /api/admin/books/:bookId` and `DELETE /api/admin/books/:bookId` replace and soft-archive a book.
- `POST /api/admin/books/:bookId/restore` restores a book with at least one active associated genre.
- `GET /api/admin/genres` and `POST /api/admin/genres` list active/archived genres and create genres.
- `PUT /api/admin/genres/:genreId` and `DELETE /api/admin/genres/:genreId` replace and soft-archive a genre.
- `POST /api/admin/genres/:genreId/restore` restores a genre when its active name and slug remain unique.

`GET /api/books` accepts the query keys `q`, `genre` (slug), `yearFrom`, `yearTo`, `sort`, `page`, and `pageSize`. The supported sorts are `newest`, `title`, and `rating`; defaults are `sort=newest`, `page=1`, and `pageSize=24`. `page` is capped at 10,000 and `pageSize` at 48. Search is a case-insensitive partial match against title and author only. Reader-facing catalogue responses expose active books and genres only, and an archived or unknown book detail returns the same `404` response.

Every `DELETE` operation above is a reversible soft archive/removal; the application never permanently deletes product records. Swagger documents 18 API paths and 24 operations. The document is generated from shared Zod contracts with `@asteasolutions/zod-to-openapi` 7.3.4 and served locally with `swagger-ui-express` 5.0.1. Its cookie-authentication scheme is intentional public contract metadata and contains no passwords, JWT secrets, hashes, or credential examples.

## Database and seeds

Prisma models users, books, genres, book/genre associations, ordered favourite genres, and reading-list entries, including soft-archive/removal timestamps and uniqueness constraints. The idempotent offline seed creates 240 deterministic active books, 12 active genres, and these two accounts:

## Roles and demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Reader | `reader@amazon2.local` | `ReaderDemo123!` |
| Librarian | `librarian@amazon2.local` | `LibrarianDemo123!` |

Authentication derives the role from the server-side record and never accepts a client-selected role.

## Layout

```text
apps/api           Express API, feature routers, Prisma migrations/seeds, OpenAPI, and API tests
apps/web           React + Vite public, reader, and librarian application with a relative API proxy
packages/contracts Shared strict Zod schemas and inferred TypeScript types
docs/design        Library Card Chaos visual, responsive, and accessibility system
compose.yaml       Trusted-local Docker Compose services for web, API, and PostgreSQL
```

## Verification and tests

The final release verification used these commands, with `<safe-32+-character-secret>` replaced by a non-committed value:

```sh
pnpm typecheck
pnpm test
pnpm build
JWT_SECRET=<safe-32+-character-secret> docker compose config --quiet
JWT_SECRET=<safe-32+-character-secret> docker compose up --build --detach
JWT_SECRET=<safe-32+-character-secret> docker compose ps
JWT_SECRET=<safe-32+-character-secret> docker compose exec api pnpm --filter @amazon-2/api prisma:migrate:deploy
JWT_SECRET=<safe-32+-character-secret> docker compose exec api pnpm --filter @amazon-2/api prisma:seed
curl --fail --silent --show-error http://localhost:3000/api/health
curl --fail --silent --show-error --location --output /dev/null http://localhost:3000/api/docs
curl --fail --silent --show-error http://localhost:3000/api/openapi.json
```

Typechecking and the production build passed. `pnpm test` passed 181 API tests in 12 files and 19 web tests in five files: 200 tests total. Coverage includes role boundaries, error/CORS policy, discovery, catalogue, engagement/archive semantics, conflict-aware repeatable seeded-genre lifecycle, preserved archived-genre associations during book edits, admin validation and transactions, OpenAPI safety including structured `413` responses, public and authenticated navigation, reader/Back Room workflows, and complete genre text for assistive technology.

The frozen-lockfile Compose rebuild passed; PostgreSQL and API reported healthy and the web service was running. Prisma reported two applied migrations with none pending. The seed reported 240 active books, 12 active genres, and two users. Live health returned `200` with the database connected, Swagger returned a final `200` after one redirect, OpenAPI JSON returned `200`, and the web proxy/auth/catalogue/genre/detail journey passed.

## Accessibility

The implementation uses semantic landmarks, labels and grouped controls, skip links, focus management and visible focus treatment, 44px touch targets, responsive navigation/forms/tables, live error and success feedback, keyboard-operable drawers/dialogs, reduced-motion handling, and forced-colour styles. Fraunces Variable and IBM Plex Mono are self-hosted in the application bundle through Fontsource with swap behavior and no font CDN. Automated UI tests cover the highest-risk navigation, validation, state, archive, role, and genre-accessibility flows.

The independent QA browser backend was unavailable. Rendered 320px and desktop geometry, complete physical-keyboard journeys, forced-colours and reduced-motion behavior at runtime, browser console/network state, and rendered Swagger interaction still require a manual browser pass; they are not claimed as certified.

## Security and deployment scope

The final fixes return oversized non-admin JSON as a safe structured `413`; every CORS response variant includes `Vary: Origin`, and rejected origins are `no-store`. A read-only security audit found no authentication bypass, role bypass, secret/hash/data leak, or unintended OpenAPI exposure.

`pnpm audit --prod --json` could not reach the package registry in the audit environment, so no clean advisory claim is made. Run a registry-backed production dependency scan in trusted CI or locally before deployment.

Docker Compose is trusted local/demo infrastructure, not a production deployment. Internet exposure would additionally require:

- restricted host publishing, non-default unprivileged database credentials/roles, non-root minimal runtime containers, production web serving instead of Vite, and immutable image/base references;
- rate limiting, a deployment-calibrated password-hashing cost, stolen-token revocation and key rotation, and a reviewed explicit CSRF strategy beyond the current `SameSite=Lax` cookie plus exact-origin credentialed CORS;
- production CSP, HSTS, `nosniff`, privileged-action audit logging, and structured security observability; and
- database-backed concurrency/integration coverage in addition to the current mocked-Prisma route tests.
