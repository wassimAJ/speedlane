# Amazon 2.0

Amazon 2.0 is an independent, playful book-library demo for the Speedlane take-home challenge. It is not affiliated with Amazon and does not use Amazon branding or trade dress.

The repository currently includes the PostgreSQL/Prisma data foundation, deterministic demo seeds, cookie-based authentication, shared Zod contracts, database-backed health checking, and the public discovery API. The React app remains a health-status scaffold; authenticated catalogue and library workflows are not implemented yet.

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

The React scaffold is available at <http://localhost:5173>. Stop the stack with `docker compose down`. To remove the local database volume as well, run `docker compose down --volumes`.

## Environment

Docker Compose provides local database and port defaults. `JWT_SECRET` has no usable default and must be replaced before starting the stack. To change ports, database credentials, cookie security, or token lifetime, edit the copied `.env` file. Never commit real credentials or a production JWT secret.

For local API commands, copy `apps/api/.env.example` to `apps/api/.env`, replace `JWT_SECRET`, and point `DATABASE_URL` at a running PostgreSQL instance.

## Local commands

```sh
pnpm install
pnpm dev          # starts the API on :3000 and Vite on :5173
pnpm build        # production-builds contracts, API, and web
pnpm typecheck
pnpm test         # runs the API test suite
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

## API status

Implemented routes:

- `GET /api/health` checks PostgreSQL and returns the shared health contract.
- `GET /api/discover` is public and returns at most six newest active books. It orders equal creation timestamps by book ID ascending and exposes only `coverSeed`, `title`, `author`, and active genre names.
- `POST /api/auth/login` validates seeded credentials and sets a short-lived JWT in an HTTP-only cookie.
- `POST /api/auth/logout` expires the session cookie.
- `GET /api/auth/me` returns the authenticated user and requires a valid session cookie.

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

The authenticated catalogue, filters, pagination, book details, preferences, reading lists, librarian management, Swagger/OpenAPI documentation, and product frontend are not implemented in this slice. `/api/docs` therefore does not exist yet.

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
apps/web           React + Vite health-status scaffold with an API proxy
packages/contracts Shared Zod schemas and inferred TypeScript types
compose.yaml       Docker Compose services for web, API, and PostgreSQL
```

## Tests

`pnpm test` currently runs 20 API tests across four files. They cover health success/failure, token and role middleware, login/session/logout behavior, CORS rejection, unauthenticated discovery access, the six-record cap, newest-first stable ordering, archived-book exclusion, the minimal database projection, and validation against the shared discovery response contract.

There are no product UI tests or database-backed integration tests yet. The live Compose smoke check covers the migrated, seeded PostgreSQL path for `GET /api/health` and `GET /api/discover`.

## Accessibility

The current web scaffold uses semantic status output and does not introduce animation. Responsive catalogue, forms, management screens, and their accessibility acceptance paths remain future work with the unimplemented frontend features.
