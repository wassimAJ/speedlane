# Architecture & trade-offs

- pnpm workspaces keep the React app, Express API, and shared Zod contracts in one TypeScript repository. The contracts package exposes schemas and inferred types so health responses have one runtime-validated definition.
- Docker Compose is the primary local environment. PostgreSQL has its own health check; the API waits for it, applies Prisma migrations, and exposes a database-backed `/api/health` route before the web service starts.
- Prisma is configured with PostgreSQL and an initial, harmless migration. The schema deliberately has no domain models yet because this task is limited to platform scaffolding; the seed is therefore an idempotent connectivity check rather than invented product data.
- Vite keeps the React scaffold small and fast. In Compose, its development server proxies `/api` requests to the API service so the browser can use same-origin paths without adding a product-level client API layer.
- The initial API includes centralized not-found and error handling. Feature-specific authentication, authorization, OpenAPI routes, and CORS policy are deferred until their product contracts exist.

# AI usage

- Codex scaffolded the workspace configuration, application skeletons, Docker Compose setup, environment templates, documentation, and health-check test.
- The generated setup was then validated with the repository’s package scripts and Docker Compose health endpoint; the README records only the commands and behaviour that are present in this scaffold.
