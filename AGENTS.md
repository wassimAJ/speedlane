# Amazon 2.0 — shared project guidance

## Product

Build **Amazon 2.0**, an independent, playful book-library demo for the
Speedlane take-home challenge. The name is a joke, not an attempt to reproduce
Amazon branding or trade dress.

Read `docs/product-spec.md` before making product, API, or user-experience
decisions. It is the source of truth for roles, behaviour, soft archives,
personalisation, public discovery, API expectations, non-goals, and acceptance
criteria.

## Technical baseline

- Use TypeScript everywhere.
- Frontend: React and a responsive, accessible client application.
- API: Node.js with Express 5, Zod validation, and central error handling.
- Persistence: PostgreSQL and Prisma migrations plus an idempotent seed.
- Authentication: hashed passwords and a short-lived JWT in an HTTP-only cookie.
- Local setup: Docker Compose runs the web app, API, and database.
- Tests must cover authorization, book discovery, and the highest-risk UI flows.
- Publish Swagger/OpenAPI documentation at `/api/docs`.

The main task owns cross-cutting decisions. Do not substitute a different
framework or data model without first explaining the trade-off to it.

## Submission documents

The repository root must contain a clear `README.md` and `DECISIONS.md`.

- README.md explains the product, roles, Docker-first setup, supported local
  commands, safe environment-variable placeholders, seeds, demo accounts,
  ports, API documentation, project layout, tests, and accessibility notes.
- DECISIONS.md has exactly two top-level sections: **Architecture &
  trade-offs** and **AI usage**. It documents only decisions and AI use that
  are true of the completed project.

## Collaboration rules

- Read this file and the relevant agent definition before changing anything.
- Stay inside your assigned files. Ask the main task before changing shared root
  configuration, another agent's area, or an API contract.
- Prefer simple, explicit code over clever abstractions. Do not add a dependency
  unless it removes meaningful implementation or maintenance cost.
- Preserve other agents' changes. Never reset, discard, or reformat unrelated
  work.
- Validate the work you own. In your handoff, state what changed, what you ran,
  and any remaining risks or decisions.
- Agent TOML files define role-specific behaviour. This file owns shared
  technical and collaboration rules; docs/product-spec.md owns product
  behaviour. Follow a newer explicit parent instruction when it changes a
  project decision.

## Delegation protocol

- Only the main task delegates work, owns shared files and API contracts,
  makes final decisions, integrates changes, and delivers the submission.
- For non-trivial API, database, authentication, seed, or API-test work,
  delegate to `backend_builder`. Integrate its result before relying on its API
  contract in the frontend.
- For visual-system or interaction decisions, delegate to `design_director`
  before substantial frontend implementation.
- For non-trivial React, responsive UI, or frontend-test work, delegate to
  `frontend_builder` after the relevant API contract is agreed.
- The main task defines or changes shared schema/API contracts; affected
  builders must review implementation impact before work proceeds.
- Delegate README.md and DECISIONS.md completion to `docs_release` only after
  the application is runnable and its behaviour is verified.
- After an integrated milestone, use `integration_qa` and
  `security_reviewer` for independent read-only checks. Route confirmed issues
  to the responsible builder.
- Run `reviewer` after high-priority QA and security findings are resolved for
  the final requirement, quality, accessibility, and documentation review.
- Do not delegate tiny edits, duplicate work across agents, or overlapping
  workspace-write tasks.

## Shared contract

The API is versionless under `/api`, the frontend treats server authorization
as authoritative, and all feature-level rules live in
`docs/product-spec.md`. Do not change its contract without informing the main
task.
