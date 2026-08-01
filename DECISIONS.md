## Architecture & trade-offs

- **Workspace and contracts.** The project uses a pnpm monorepo with a React client, an Express 5 API, PostgreSQL through Prisma, and shared Zod contracts. This keeps request and response shapes consistent across packages. The trade-off is tighter coordination between package builds and releases; production can strengthen this with independent CI/deployment pipelines and explicit contract release gates.
- **Local services.** Docker Compose provides a reproducible local database, API, and web setup with health-based startup dependencies. This favors reliable onboarding over production-grade orchestration. Production should use immutable images, managed PostgreSQL and secrets, and hardened service orchestration.
- **Authentication and signup.** Authentication uses HTTP-only cookies, while public signup creates Reader accounts and requires email verification delivered through Resend. This keeps session tokens out of browser JavaScript and limits self-service privilege escalation. The current in-process email delivery and rate limiting are simpler than distributed production infrastructure; production should add durable email jobs, a shared rate limiter, managed secrets and key rotation, and an audited librarian onboarding flow. Librarian onboarding is intentionally not implemented in this slice.
- **Accessible browsing.** The catalogue defaults to paginated browsing and also offers a continuous/infinite-scroll mode with a manual “Load more books” fallback when automatic loading is unavailable; reduced-motion preferences are respected. This supports more users and input methods at the cost of additional client state and test paths. Production should add regular real-device, browser, keyboard, and assistive-technology regression testing.

## AI usage

Codex and its delegated agents were the only AI tools used. They assisted with scaffolding, implementation, testing, and documentation; their changes were reviewed and verified through project typechecks, automated tests, builds, Compose validation, and focused live checks.

One revised-output example: early copy said, `Use a seeded demo account to browse the full active collection.` It was revised to `Sign in to browse the full active collection.`, and the Reader demo-card credential panel was removed.
