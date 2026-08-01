# Amazon 2.0

Amazon 2.0 is an independent, playful book-library demo for the Speedlane take-home challenge. It is not affiliated with Amazon and does not use Amazon branding or trade dress.

The repository currently includes the PostgreSQL/Prisma data foundation, deterministic demo seeds, cookie-based authentication, shared Zod contracts, database-backed health checking, public discovery, authenticated catalogue APIs, and a React sign-in, catalogue, and book-detail flow.

## Quick start

Prerequisites: Docker Desktop with Docker Compose v2. For local (non-Docker) development, use Node.js 22+ and pnpm 10+.

Copy the environment template and replace `JWT_SECRET` with at least 32 random characters:

```sh
cp .env.example .env
docker compose up --build --detach
docker compose exec api pnpm --filter @amazon-2/api prisma:seed
```

Compose applies Prisma migrations automatically when the API starts. Seeding is an explicit, idempotent step so it can safely be repeated.

Verify the public API:

```sh
curl --fail http://localhost:3000/api/health
curl --fail http://localhost:3000/api/discover
```

The authenticated React app is available at <http://localhost:5173>. Stop the stack with `docker compose down`. To remove the local database volume as well, run `docker compose down --volumes`.

## Environment

Docker Compose provides local database and port defaults. `JWT_SECRET` has no usable default and must be replaced before starting the stack. To change ports, database credentials, cookie security, or token lifetime, edit the copied `.env` file. Never commit real credentials or a production JWT secret.

For local API commands, copy `apps/api/.env.example` to `apps/api/.env`, replace `JWT_SECRET`, and point `DATABASE_URL` at a running PostgreSQL instance. The browser app calls relative `/api` URLs with credentials included, so Vite proxies API traffic in local and Compose environments. The JWT remains in the server-set HTTP-only cookie and is never stored in client-side state, local storage, or session storage.

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

## API and app status

Implemented routes:

- `GET /api/health` checks PostgreSQL and returns the shared health contract.
- `GET /api/discover` is public and returns at most six newest active books. It orders equal creation timestamps by book ID ascending and exposes only `coverSeed`, `title`, `author`, and active genre names.
- `POST /api/auth/login` validates seeded credentials and sets a short-lived JWT in an HTTP-only cookie.
- `POST /api/auth/logout` expires the session cookie.
- `GET /api/auth/me` returns the authenticated user and requires a valid session cookie.
- `GET /api/books` requires the JWT cookie and returns active book summaries with pagination metadata.
- `GET /api/books/:bookId` requires the JWT cookie and returns one active book's reader-facing detail.
- `GET /api/genres` requires the JWT cookie and returns active genre summaries.

`GET /api/books` accepts the query keys `q`, `genre` (slug), `yearFrom`, `yearTo`, `sort`, `page`, and `pageSize`. The supported sorts are `newest`, `title`, and `rating`; defaults are `sort=newest`, `page=1`, and `pageSize=24`. `page` is capped at 10,000 and `pageSize` at 48. Search is a case-insensitive partial match against title and author only. Reader-facing catalogue responses expose active books and genres only, and an archived or unknown book detail returns the same `404` response.

The React app bootstraps the current session, redirects anonymous visitors away from protected routes, supports sign-in and sign-out, and treats an expired session as a return to sign-in. Its catalogue keeps search, active-genre and publication-year filters, sort, page, and page size in the URL; supports reset, loading, updating, empty, invalid-query, and retry states; and renders responsive filter controls and pagination. Book links open an active-book detail view and preserve the prior catalogue query for the return path.

Example discovery response:

```json
{
  "books": [
    {
      "coverSeed": "amazon-2-cover-240",
      "title": "The Unwritten Voyage",
      "author": "Theo Laurent",
      "genres": ["Graphic Novels", "Poetry"]
    }
  ]
}
```

The expanded public landing experience, preferences/personalisation APIs and UI, reading-list APIs and UI, librarian management APIs and UI, and Swagger/OpenAPI documentation remain unimplemented. `/api/docs` therefore does not exist yet.

## Database and seeds

Prisma models users, books, genres, book/genre associations, ordered favourite genres, and reading-list entries, including the specified soft-archive/removal timestamps. The idempotent seed creates 240 deterministic active books, 12 active genres, and the two demo accounts below without using external services.

## Roles and demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Reader | `reader@amazon2.local` | `ReaderDemo123!` |
| Librarian | `librarian@amazon2.local` | `LibrarianDemo123!` |

There is no public registration flow. Authentication derives the role from the server-side user record and never accepts a client-selected role.

## Ports

- Web: `5173`
- API: `3000`
- PostgreSQL: `5432`

Override them in `.env` using `WEB_PORT`, `API_PORT`, and `POSTGRES_PORT`.

## Layout

```text
apps/api           Express 5 API with app.ts composition, feature-oriented routers, Prisma, seeds, and API tests
apps/web           React + Vite authenticated catalogue/detail app with a relative API proxy
packages/contracts Shared Zod schemas and inferred TypeScript types
docs/design        Library Card Chaos design system for implemented and future frontend work
compose.yaml       Docker Compose services for web, API, and PostgreSQL
```

## Tests

`pnpm test` currently runs 55 tests across seven files: 51 API tests across six files and four focused web UI tests in one file. API coverage includes health, authentication/authorization, CORS, public discovery, catalogue validation and filtering, pagination, stable ordering, archive visibility, active genres, strict response contracts, and minimal Prisma projections. Web coverage includes anonymous-session redirection, credentialed cookie sign-in into the protected catalogue, URL hydration and page reset for search/filters, client-side year-range validation, and malformed-query normalization.

There are no database-backed automated integration tests yet. The live Compose smoke check covers the web-to-API proxy, migrated and seeded PostgreSQL, login, session-authenticated catalogue and genres, and book detail.

## Accessibility

The implemented flow uses semantic landmarks and controls, labelled status/error states, a skip link, visible focus treatment, keyboard-operable filters and pagination, responsive catalogue/detail layouts, and reduced-motion styles. A browser-only manual journey across the required viewports and full keyboard path has not been certified yet; automated UI tests do not replace that remaining check.
