# Amazon 2.0

Amazon 2.0 is an independent, playful book-library application built for the Speedlane take-home challenge. It is not affiliated with Amazon and does not use Amazon branding or trade dress.

The application includes public discovery and Reader registration/email verification, authenticated reader catalogue, profile and engagement flows, a librarian Back Room, and public Swagger/OpenAPI documentation. PostgreSQL/Prisma persistence, deterministic seed fixtures, cookie authentication, shared Zod contracts, and the responsive React application run together through Docker Compose.

## Product status

- Visitors can open the public landing page, see exactly six newest active book previews from `GET /api/discover`, register a Reader account, verify or resend verification email, read the independence statement, and continue to sign in.
- Readers can sign in and out, view account details, change their display name, browse/search/filter/sort/paginate the active catalogue, open book details, save zero to five ordered favourite genres, receive at most six personalised **For your shelves** results, and manage **Want to read**, **Reading**, and **Finished** reading-list states. Soft-removed entries can be restored with their previous state; archived books remain as unavailable shelf history and can still be removed.
- Librarians have all reader capabilities plus the **Back Room**, with active and archived views for books and genres and create, edit, archive, and restore workflows. A genre cannot be archived while it is the sole active genre of an active book.

Public registration can stage a new `READER` account; role and other privileged input are rejected and roles remain server-owned. No staged display name or password becomes an account credential until the matching browser-bound challenge is verified. Password reset, email change, and librarian self-registration/onboarding are not implemented.

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

Docker Compose defaults to web `5173`, API `3000`, and PostgreSQL `5432`. The copied `.env` can override those ports, the trusted-local database credentials, cookie security, and the 900-second token lifetime. Never commit a real JWT secret or reuse the default local database credentials outside this environment.

For non-Docker API or Prisma commands, copy `apps/api/.env.example` to `apps/api/.env`, replace `JWT_SECRET`, and provide a reachable `DATABASE_URL`. A running PostgreSQL instance is required for development API startup, migrations, and seeding; Prisma client generation does not require a database connection.

The browser calls relative `/api` URLs with credentials included, and Vite proxies those requests to the API in local and Compose environments. The JWT remains in the server-set HTTP-only cookie and is never stored in React state, local storage, or session storage.

### Verification email delivery

Verification email uses the official Resend SDK. To enable delivery, verify a sending domain/sender in Resend, then set both `RESEND_API_KEY` and `RESEND_FROM_EMAIL`; the sender may be a verified address or a `Display Name <verified@example.com>` value. Never commit either a real API key or other production secrets. Supplying only one variable is rejected during environment validation.

With delivery configured, accepted registration and resend outcomes return the same generic `202` and set an HTTP-only pending-verification cookie. Delivery is then scheduled as an in-process best-effort task. A provider failure happens after the generic response, immediately scrubs the unusable challenge's secrets, and allows same-browser resend recovery after the cooldown. There is no durable mail queue, so process exit can lose scheduled delivery.

Leaving both variables empty keeps login, profile, email verification for an already-delivered challenge, discovery, and the rest of the existing application working. Every otherwise-valid registration or resend request returns the same controlled `503` for every account state, before password hashing, account lookup or mutation, challenge creation, dispatch, or a pending cookie. Automated tests inject mock mail clients and never send real email; live Resend delivery was not part of release verification.

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
- `POST /api/auth/register` accepts only display name, email, and a policy-compliant password. With mail configured, it may stage a new unverified Reader and returns a generic `202` for every accepted address outcome without establishing a session; existing verified accounts are not mutated.
- `POST /api/auth/verify-email` accepts email and a six-digit code, and also requires the pending-verification cookie from the same active browser setup. A match atomically commits the staged Reader credentials, verifies the email, clears the pending cookie, and establishes the normal session cookie.
- `POST /api/auth/resend-verification` returns the generic `202` when delivery is configured. A matching active pending cookie may schedule a replacement after cooldown; a missing or stale browser binding cannot attach to or mutate someone else's staged credentials.
- `POST /api/auth/login` validates seeded credentials and sets a short-lived JWT in an HTTP-only cookie.
- `POST /api/auth/logout` idempotently expires the session cookie.
- `GET /api/openapi.json` returns the OpenAPI 3.0.3 document.
- `GET /api/docs` redirects once to the public Swagger UI at `/api/docs/`.

Authenticated reader routes are:

- `GET /api/auth/me` returns the authenticated user and requires a valid session cookie.
- `GET /api/me/profile` lets an authenticated Reader or Librarian read their email, display name, role, verification timestamp, and creation timestamp.
- `PUT /api/me/profile` lets either authenticated role change only their display name; email and role remain read-only.
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

Registration passwords require 12 to 128 characters including lowercase, uppercase, and a number. Candidate display names and password hashes live in a non-authenticated `PendingRegistration` for at most 24 hours. Its 256-bit browser token and each six-digit verification code are persisted only as keyed hashes. The short-lived pending cookie is HTTP-only, `SameSite=Lax`, and `Secure` when configured; it is not an authenticated session. Only a matching email, code, pending registration, and cookie can atomically commit Reader credentials. Codes expire after ten minutes, allow at most five attempts, and are single-use.

Register, verification, and resend routes have process-local fixed-window limits. The 60-second resend cooldown includes terminal challenge outcomes and never extends the 24-hour setup lifetime. A missing, stale, or mismatched browser hint safely returns the visitor to a fresh sign-up; duplicate or out-of-order requests cannot commit credentials without the bound challenge. The frontend's `localStorage` value is only a normalized `{ email, startedAt }` UX hint: it contains no name, password, code, cookie, or server credential and is never authoritative. A verified account is required before login or authenticated middleware will establish access.

Every `DELETE` operation above is a reversible soft archive/removal; the application never permanently deletes product records. Swagger documents 22 API paths and 29 operations. The document is generated from shared Zod contracts with `@asteasolutions/zod-to-openapi` 7.3.4 and served locally with `swagger-ui-express` 5.0.1. Its normal-session and pending-verification cookie schemes are intentional public contract metadata; cookie values are omitted, and the document contains no passwords, JWT secrets, verification codes/hashes, or credential examples.

## Database and seeds

Prisma models users, 24-hour pending registrations, hashed single-use email-verification challenges, books, genres, book/genre associations, ordered favourite genres, and reading-list entries, including soft-archive/removal timestamps and uniqueness constraints. Four migrations are committed. The idempotent offline seed creates 240 deterministic active books, 12 active genres, and these two already-verified account fixtures:

## Seeded local accounts

| Role | Email | Password |
| --- | --- | --- |
| Reader | `reader@amazon2.local` | `ReaderDemo123!` |
| Librarian | `librarian@amazon2.local` | `LibrarianDemo123!` |

Authentication derives the role and verification state from the server-side record and never accepts a client-selected role. The seed credentials are for local evaluation only.

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
pnpm typecheck && pnpm test && pnpm build
pnpm --filter @amazon-2/api exec vitest run src/account src/auth src/openapi/routes.test.ts
JWT_SECRET=<safe-32+-character-secret> docker compose config --quiet
JWT_SECRET=<safe-32+-character-secret> docker compose up --build --detach
JWT_SECRET=<safe-32+-character-secret> docker compose ps
JWT_SECRET=<safe-32+-character-secret> docker compose exec api pnpm --filter @amazon-2/api prisma:migrate:deploy
JWT_SECRET=<safe-32+-character-secret> docker compose exec api pnpm --filter @amazon-2/api prisma:seed
curl --fail --silent --show-error http://localhost:3000/api/health
curl --fail --silent --show-error --location --output /dev/null http://localhost:3000/api/docs
curl --fail --silent --show-error http://localhost:3000/api/openapi.json
git diff --check
```

The combined workspace typecheck, test, and production-build command passed, as did the final diff check. `pnpm test` passed 250 API tests in 21 files and 56 web tests in eight files: 306 tests total. The focused account, authentication, and OpenAPI command passed 70 tests in 11 files. Coverage includes Reader-only staged registration, browser/challenge binding, uniform unconfigured-mail behavior, generic configured-mail outcomes, resend and delivery-failure cleanup, scheduled secret cleanup, profile access and display-name-only updates, route limits, role boundaries, error/CORS policy, discovery, catalogue, engagement/archive semantics, repeatable seed lifecycles, admin validation and transactions, OpenAPI safety, public and authenticated navigation, reader/Back Room/account workflows, and genre accessibility.

Compose configuration validation and the image rebuild passed; PostgreSQL and API reported healthy and the web service was running on rebuilt/current images. Prisma reported four applied migrations with none pending. The seed reported 240 active books, 12 active genres, and two already-verified users. Live API checks returned `200` for health and discovery (six previews); Swagger returned a final `200` after one redirect, and OpenAPI contained 22 paths and 29 operations. Live web checks returned `200` for `/`, `/sign-up`, `/verify-email`, and `/account`. Resend remained intentionally unconfigured: provider behavior was verified through injected/mock delivery only, not by sending live mail.

## Accessibility

The implementation uses semantic landmarks, labels and grouped controls, skip links, focus management and visible focus treatment, 44px touch targets, responsive navigation/forms/tables, live error and success feedback, keyboard-operable drawers/dialogs, reduced-motion handling, and forced-colour styles. Fraunces Variable and IBM Plex Mono are self-hosted in the application bundle through Fontsource with swap behavior and no font CDN. Automated UI tests cover the highest-risk navigation, validation, state, archive, role, and genre-accessibility flows.

The independent QA browser backend was unavailable. Rendered 320px and desktop geometry, complete physical-keyboard journeys, forced-colours and reduced-motion behavior at runtime, browser console/network state, and rendered Swagger interaction still require a manual browser pass; they are not claimed as certified.

## Security and deployment scope

The final fixes return oversized non-admin JSON as a safe structured `413`; every CORS response variant includes `Vary: Origin`, and rejected origins are `no-store`. Pending registration prevents account credential changes from being committed without the browser-bound challenge, and unconfigured mail fails uniformly before account-state access.

The final `pnpm audit --prod --json` was not performed because this environment's approval policy rejected transmitting dependency metadata to the external registry. No clean or failing advisory claim is made; run the registry-backed production dependency scan in trusted CI or another user-authorized environment before deployment.

Docker Compose is trusted local development infrastructure, not a production deployment. Internet exposure would additionally require:

- restricted host publishing, non-default unprivileged database credentials/roles, non-root minimal runtime containers, production web serving instead of Vite, and immutable image/base references;
- a shared rate-limit store for multi-instance account enforcement plus limits for other abuse-sensitive routes, a deployment-calibrated password-hashing cost, stolen-token revocation and key rotation, and a reviewed explicit CSRF strategy beyond the current `SameSite=Lax` cookie plus exact-origin credentialed CORS;
- production CSP, HSTS, `nosniff`, privileged-action audit logging, and structured security observability; and
- database-backed concurrency/integration coverage in addition to the current mocked-Prisma route tests.

Sensitive account-setup cleanup runs before the API starts listening and every five minutes thereafter. It uses a batch size of 100 and a maximum of 100 batches per run, uses generic operational logging, scrubs a failed delivery immediately, and removes expired 24-hour pending setup data after challenge secrets are scrubbed.

The implemented account rate limiter is bounded and fail-closed but process-local, so separate API instances do not share counters. Verification mail is also an in-process best-effort task with no durable queue. Password reset, email-address change, librarian onboarding, and a production email-delivery operational runbook remain feature gaps.
