# Amazon 2.0

## Setup and run

The quickest way to run the whole project is with Docker Compose.

### Before you start

Install Git, Node.js 22 or newer, and Docker Desktop (or Docker Engine with Compose v2). The default ports are `5432` for PostgreSQL, `3000` for the API, and `5173` for the web app. See [Troubleshooting](#troubleshooting) if one is already in use.

### 1. Clone the project and install packages

```sh
git clone git@github.com:wassimAJ/speedlane.git amazon-2
cd amazon-2
corepack enable
corepack prepare pnpm@10.13.1 --activate
pnpm install --frozen-lockfile
```

If you already have the repository, run the commands from `corepack enable` onward in its root directory.

### 2. Create your local environment file

Copy the template, then run the second command to put a safe random JWT secret into `.env`:

```sh
cp .env.example .env
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),p=".env";fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/^JWT_SECRET=.*$/m,`JWT_SECRET=${crypto.randomBytes(32).toString("hex")}`));'
```

That is enough for the normal local setup. The template's PostgreSQL credentials are local-only defaults, and `.env` is ignored by Git. Never commit real secrets.

### 3. Start everything, migrate, seed, and check health

```sh
docker compose up --build --detach --wait
docker compose exec api pnpm --filter @amazon-2/api prisma:migrate:deploy
docker compose exec api pnpm --filter @amazon-2/api prisma:seed
curl --fail --silent --show-error http://localhost:3000/api/health
```

`--wait` keeps the sequence from continuing until the services are ready. The API also applies migrations automatically when its container starts. Both the migration and deterministic seed commands are safe to repeat.

### 4. Open the app and sign in

| Surface | URL |
| --- | --- |
| Web application | <http://localhost:5173> |
| API health | <http://localhost:3000/api/health> |
| Public discovery | <http://localhost:3000/api/discover> |
| Swagger UI | <http://localhost:3000/api/docs> |
| OpenAPI 3.0.3 JSON | <http://localhost:3000/api/openapi.json> |

Use either already-verified local fixture:

| Role | Email | Password |
| --- | --- | --- |
| Reader | `reader@amazon2.local` | `ReaderDemo123!` |
| Librarian | `librarian@amazon2.local` | `LibrarianDemo123!` |

The idempotent seed creates these users along with 240 active books and 12 active genres.

### Optional: enable signup email

The application is fully runnable without email configuration: use one of the local fixtures above. Public registration and resend return a controlled `503` until email delivery is enabled.

To test public Reader signup, first verify a sending domain or sender in Resend. Then set both `RESEND_API_KEY` and `RESEND_FROM_EMAIL` in `.env` and rerun `docker compose up --build --detach`. The sender can be a verified email address or `Display Name <verified-address@example.com>`. Set both variables or leave both empty, and never commit the API key. Live Resend delivery was not part of release verification.

When finished, stop the stack without deleting its PostgreSQL data:

```sh
docker compose down
```

For a clean reset, see [Troubleshooting](#troubleshooting); removing the Compose volume deletes all local data.

## Development and verification

### Host development

The root `.env` is for Compose. Host-run API commands load `apps/api/.env`, so create it separately. These commands retain the Compose database volume, stop the Compose API/web services if present, and run the TypeScript API and Vite locally:

```sh
docker compose down
docker compose up --detach db
cp apps/api/.env.example apps/api/.env
node -e 'const fs=require("node:fs"),crypto=require("node:crypto"),p="apps/api/.env";fs.writeFileSync(p,fs.readFileSync(p,"utf8").replace(/^JWT_SECRET=.*$/m,`JWT_SECRET=${crypto.randomBytes(32).toString("hex")}`));'
pnpm db:migrate
pnpm db:seed
pnpm dev
```

The API starts on `3000` and Vite on `5173`. If the root PostgreSQL credentials or port were changed, update `DATABASE_URL` in `apps/api/.env` before running Prisma or the API. Configure the same paired Resend variables there when testing signup outside Compose.

### Build, typecheck, and tests

```sh
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` compiles the shared contracts, Express API, and React application. The final verified workspace run passed 250 API tests in 21 files and 56 web tests in eight files: 306 tests total. The focused account/authentication/OpenAPI run also passed:

```sh
pnpm --filter @amazon-2/api exec vitest run src/account src/auth src/openapi/routes.test.ts
```

Result: 11 test files and 70 tests passed. The Compose configuration and rebuild passed, PostgreSQL and the API were healthy, the web service was running, four migrations had no pending work, and live API checks returned `200` for health, discovery, and Swagger after its redirect. SPA page-shell `GET` requests to `/`, `/sign-up`, `/verify-email`, and `/account` also returned `200`. Registration email delivery and email verification were not exercised end to end; no live email was sent.

The Compose `web` service intentionally runs Vite for local evaluation. `pnpm build` creates production assets, but hardened production hosting and deployment are outside this repository's scope.

## Product and roles

Amazon 2.0 is an independent book-library application built for the Speedlane take-home. It is not affiliated with Amazon and does not use Amazon branding or trade dress.

- **Visitor:** sees the public landing page and at most six newest active book previews; can sign in or begin Reader signup. The authenticated catalogue remains private.
- **Reader:** can verify email, sign in/out, edit only their display name, browse/search/filter/sort the catalogue, choose up to five ordered favourite genres, receive personalised shelf suggestions, view book details, and manage a soft-removable reading list.
- **Librarian:** has all Reader capabilities plus the Back Room for creating, editing, archiving, and restoring books and genres. Archive operations are reversible; a genre cannot be archived when it is an active book's only active genre.

Public signup creates Reader accounts only and rejects role or other privileged fields. Signup first stages candidate credentials in a browser-bound, non-authenticated setup; a six-digit code and the matching HTTP-only pending cookie must verify before the Reader credentials are committed and the normal session begins. Librarian onboarding is intentionally a separate, unimplemented administrative concern.

Password reset, email change, external identity providers, reviews, borrowing, payments, analytics, and a production deployment are not implemented.

## Deterministic development fixtures

The already-verified credentials are listed in [Setup and run](#4-open-the-app-and-sign-in). Do not reuse them outside this development stack. The seed also reconciles 12 active genres and 240 deterministic active books without network access.

## Architecture

This is a TypeScript pnpm workspace with three main packages:

```text
apps/web           React 19 + Vite client, responsive routes, and relative /api proxy
apps/api           Express 5 API, Prisma persistence, feature routers, OpenAPI, and tests
packages/contracts Strict shared Zod schemas and inferred TypeScript types
```

- **Persistence:** PostgreSQL 16 with Prisma 6, four committed migrations, deterministic IDs/data, and reversible `archivedAt`/`removedAt` workflows.
- **API:** versionless `/api` routes, strict request/response contracts, narrow Prisma projections, centralized CORS/error handling, and contract-derived Swagger/OpenAPI documentation.
- **Authentication:** scrypt password hashes and a short-lived HS256 JWT in an HTTP-only, `SameSite=Lax` cookie. Roles and verification state are reloaded from PostgreSQL.
- **Email verification:** the official Resend SDK sits behind an injected delivery interface. Codes expire after ten minutes, are single-use and attempt-limited, and are stored only as keyed hashes. Pending signup lasts at most 24 hours. Delivery is best-effort and process-local; there is no durable mail queue.
- **Services:** Compose runs `db` (persistent PostgreSQL), `api` (build, migrate, start, and health check), and `web` (Vite plus an API proxy). The API waits for a healthy database and the web service waits for a healthy API.
- **Frontend:** React Router separates public, Reader, and Librarian surfaces. The verification UI keeps only a non-authoritative normalized email/start-time hint in local storage; JWT and pending-cookie values remain inaccessible to JavaScript.

The account rate limiter is bounded but process-local, so a multi-instance deployment would need shared enforcement. Expired pending-registration secrets are scrubbed before API startup and periodically while it runs.

## API surface

Swagger at `/api/docs` is the definitive operation-level reference. The generated document contains 22 paths and 29 implemented operations, including:

- public health, discovery, login/logout, Reader registration, and email verification/resend;
- authenticated profile, active catalogue/detail/genres, favourite genres, personalised shelves, and reading-list routes; and
- Librarian-only book and genre create, edit, archive, and restore routes.

Swagger UI and the OpenAPI JSON are served as documentation endpoints in addition to those documented operations.

Public discovery returns at most six newest active books with a stable book-ID tie-breaker and only cover, title, author, and active-genre preview fields. Reader-facing catalogue routes exclude archived records; existing reading-list history retains a safe unavailable preview when its book is later archived.

## Accessibility

The client uses semantic landmarks and labels, skip links, visible focus treatment, grouped controls, live status/error feedback, 44px targets, keyboard-operable dialogs/drawers, responsive layouts, reduced-motion handling, and forced-colour styles. Fraunces Variable and IBM Plex Mono are bundled locally rather than loaded from a CDN.

Automated tests cover the highest-risk navigation, validation, account, archive, role, and assistive-text flows. The independent browser-QA backend remained unavailable after retry, so rendered geometry, full physical-keyboard journeys, runtime forced-colour/reduced-motion checks, console/network inspection, and rendered Swagger interaction still need a manual browser pass.

## How it was built

1. The product rules were established in [`docs/product-spec.md`](docs/product-spec.md), with responsive and accessible interaction guidance in [`docs/design/design-system.md`](docs/design/design-system.md).
2. Shared Zod contracts defined runtime and TypeScript boundaries before the Express feature routers and React flows were integrated.
3. Prisma migrations and an idempotent offline seed established deterministic persistence, roles, archives, preferences, reading lists, and browser-bound account verification.
4. Focused API/UI suites, workspace typechecking/builds, independent QA/security review, Compose validation, migrations, seeding, and live endpoint checks closed the milestone.

Architecture trade-offs and AI-assisted workflow details are recorded in [`DECISIONS.md`](DECISIONS.md).

## Troubleshooting

- **Compose reports `JWT_SECRET` is missing or invalid:** copy `.env.example` to `.env` and run the secret-generation command from Setup. The committed placeholder is intentionally rejected.
- **Signup or resend returns `503`:** configure both Resend variables, verify that `RESEND_FROM_EMAIL` belongs to a verified Resend sender/domain, then restart the API. With both variables empty, `503` is intentional and uniform.
- **The API is unhealthy or exits during startup:** inspect `docker compose logs api db`. If the API container is running, use `docker compose exec api pnpm --filter @amazon-2/api prisma:migrate:deploy`. If it exited, confirm or start PostgreSQL with `docker compose up --detach db` and `docker compose ps db`, then run the migration in a disposable API container with `docker compose run --rm api pnpm --filter @amazon-2/api prisma:migrate:deploy`.
- **A host port is already in use:** change `POSTGRES_PORT`, `API_PORT`, or `WEB_PORT` in `.env`, then recreate the stack. Direct URLs in this README assume the defaults.
- **Changed PostgreSQL credentials do not affect an existing volume:** PostgreSQL initializes credentials only when its data directory is new. Preserve the current values, or intentionally reset with `docker compose down --volumes` and reseed; the reset destroys local data.
- **Host development cannot connect to PostgreSQL:** check `DATABASE_URL` in `apps/api/.env`, especially after changing Compose database credentials or `POSTGRES_PORT`.
- **Cookies work locally but not behind HTTPS, or vice versa:** keep `COOKIE_SECURE=false` for local HTTP and set it to `true` only for HTTPS. Ensure `CORS_ORIGIN` exactly matches the browser origin in host development.
- **Dependency advisories are unknown:** the final `pnpm audit --prod --json` was not performed because this environment's policy did not permit transmitting dependency metadata to the external registry. Run it in trusted CI or another user-authorized environment; no clean or failing audit result is claimed here.
