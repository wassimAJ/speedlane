# Amazon 2.0

Amazon 2.0 is an independent, playful book-library demo for the Speedlane take-home challenge. It is not affiliated with Amazon and does not use Amazon branding or trade dress.

This commit establishes the Docker-first TypeScript platform: a React client, Express 5 API, PostgreSQL, Prisma, and shared Zod contracts. Product routes, data models, authentication, and book-library UI are deliberately not implemented yet.

## Quick start

Prerequisites: Docker Desktop with Docker Compose v2. For local (non-Docker) development, use Node.js 22+ and pnpm 10+.

```sh
docker compose up --build
```

Then verify the API from another terminal:

```sh
curl --fail http://localhost:3000/api/health
```

The React scaffold is available at <http://localhost:5173>. Stop the stack with:

```sh
docker compose down
```

To remove the local database volume as well, run `docker compose down --volumes`.

## Environment

Docker Compose has safe local defaults. To change ports or database credentials, copy the template and edit the copy:

```sh
cp .env.example .env
```

The API template is at `apps/api/.env.example`; it includes placeholders for the future JWT and CORS configuration. Never commit real credentials or a production JWT secret.

## Local commands

```sh
pnpm install
pnpm dev          # starts the API on :3000 and Vite on :5173
pnpm build        # builds contracts, API, and web
pnpm typecheck
pnpm test
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

For local API commands, create `apps/api/.env` from `apps/api/.env.example` and point `DATABASE_URL` at a running PostgreSQL instance. The Compose stack runs Prisma migrations automatically before starting the API.

## Health check

`GET /api/health` is the only application route in this scaffold. It checks PostgreSQL with Prisma and returns a shared, Zod-validated response:

```json
{
  "status": "ok",
  "service": "api",
  "database": "connected",
  "timestamp": "2026-08-01T00:00:00.000Z"
}
```

Docker Compose also waits for PostgreSQL, migrations, and this API health check before it starts the web service.

## Layout

```text
apps/api          Express 5 API, Prisma, migration, no-op idempotent seed, API health test
apps/web          React + Vite scaffold and proxied health status view
packages/contracts Shared Zod schemas and inferred TypeScript types
compose.yaml      Docker Compose services for web, API, and PostgreSQL
```

## Database and seeds

The initial Prisma migration establishes the migration workflow but intentionally contains no domain tables. `pnpm db:seed` is an idempotent connectivity check and creates no product data. Future product implementation will add users, books, genres, preferences, and reading-list data along with the requested demo accounts.

## Roles and demo accounts

The product specification defines visitor, reader, and librarian roles. Authentication and authorization are intentionally not scaffolded beyond the reserved `JWT_SECRET` environment placeholder, so no demo accounts exist yet and no role-specific workflow can be exercised. They will be introduced only alongside the corresponding data model and API contracts.

## Ports

- Web: `5173`
- API: `3000`
- PostgreSQL: `5432`

Override them in `.env` using `WEB_PORT`, `API_PORT`, and `POSTGRES_PORT`.

## API documentation and future scope

Swagger/OpenAPI documentation will be published at `/api/docs` when product endpoints are added. Authentication, demo accounts, book discovery, library management, product tests, and accessibility flows are intentionally outside this scaffold and are not claimed as implemented.

The current web page is semantic and keyboard-accessible, and it respects reduced motion by not using animation. The finished product will add the responsive, accessible interaction flows defined in `docs/product-spec.md`.

## Tests

`pnpm test` runs focused API tests for successful and unavailable-database health responses. Product authorization, discovery, and UI-flow tests belong to the feature implementation phase and are not claimed as present in this scaffold.
