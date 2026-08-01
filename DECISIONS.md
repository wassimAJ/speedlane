# Architecture & trade-offs

- pnpm workspaces keep the React app, Express API, and shared contracts in one TypeScript repository. The contracts package exports Zod schemas and inferred types for health, authentication, errors, and public discovery so runtime and compile-time API definitions stay aligned.
- PostgreSQL persistence uses Prisma migrations and explicit soft-archive/removal fields. The deterministic, idempotent seed creates 240 books, 12 genres, and reader/librarian demo users without network dependencies.
- Public discovery is a dedicated narrow database projection. It queries only active books, limits results to six, orders by `createdAt` descending and then `id` ascending, filters archived genres, and maps associations to display-only genre names before validating the strict response contract.
- Authentication uses scrypt password hashes and a short-lived signed token stored in an HTTP-only, same-site cookie. Roles come from server-side user records, CORS accepts only the configured origin for browser requests, and centralized error handling keeps error responses consistent.
- `app.ts` is the API composition root for global middleware, router mounting, not-found handling, and centralized errors. Health, authentication, and discovery use feature-oriented router factories with narrow store interfaces so route ownership and dependencies stay explicit without changing endpoint behavior.
- Docker Compose remains the primary local environment: PostgreSQL is health-checked, the API generates its Prisma client during image construction, applies migrations on startup, and exposes a database-backed health check before the web service starts. Seeding remains an explicit repeatable command rather than an automatic startup mutation.
- The authenticated catalogue, preferences, reading lists, librarian management, Swagger/OpenAPI, and product frontend are deliberately deferred because this completed slice is limited to public discovery and its existing foundations.

# AI usage

- Codex implemented the shared public-discovery contracts, Prisma projection, Express route, focused tests, API image build-order correction, and the documentation updates in this slice.
- Codex verified the work with workspace typechecking, the full API suite, a production build, Compose configuration validation, an API image rebuild, and live requests to the health and discovery endpoints. The Docker build exposed the Prisma generation-order issue; the final Dockerfile reflects the verified correction.
