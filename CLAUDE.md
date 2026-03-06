# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Credara is a media literacy LMS for schools. The backend is a TypeScript/Fastify REST API backed by PostgreSQL. See `credara.md` for the full product spec and `thoughts/shared/plans/2026-03-04-credara-backend.md` for the implementation plan.

## Tech Stack

- **Runtime:** Node.js + TypeScript (strict, ESM)
- **Framework:** Fastify with `fastify-type-provider-zod` for validation
- **Database:** PostgreSQL with Drizzle ORM, migrations via Drizzle Kit
- **Auth:** Session-based (bcrypt + httpOnly cookies + sessions table in Postgres)
- **Testing:** Vitest with integration tests against a real test database
- **Deployment:** Docker (multi-stage build) → GCP Cloud Run + Cloud SQL

## Common Commands

```bash
docker compose up -d          # start local Postgres
npm run dev                   # start app with hot reload (tsx watch)
npm run build                 # compile TypeScript
npm test                      # run all tests
npx vitest run src/test/integration/auth.test.ts  # run single test file
npx drizzle-kit generate      # generate migration from schema changes
npx drizzle-kit migrate       # apply migrations
npm run seed                  # seed development data
docker build .                # build production image
```

## Architecture

### Directory Structure

Feature-based organization. Each feature module has `routes.ts` (Fastify route definitions) and `service.ts` (business logic). Shared concerns live in `src/lib/`.

- `src/db/schema.ts` — all Drizzle table definitions (single file)
- `src/lib/middleware.ts` — `requireAuth` and `requireRole` preHandler hooks
- `src/lib/auth.ts` — password hashing, session create/delete/lookup
- `src/features/` — feature modules (auth, users, schools, classes, lessons, etc.)
- `src/test/helpers.ts` — test factories and auth helpers

### Key Domain Model Decisions

- **Users vs roles:** The `users` table holds only identity (email, password). Name and role are in `user_school_roles` — a user can have multiple roles across schools. Names are per-context since someone may go by different names in different schools.
- **Sessions are context-scoped:** Each session is tied to a specific `user_school_role_id`. To switch school/role context, the user must log out and log in again.
- **Authorization:** Two-layer middleware: `requireAuth` (validates session, attaches user + context) → `requireRole('teacher')` (checks role hierarchy: student < teacher < admin < superadmin). School scoping is enforced in service functions using the session's `school_id`.
- **Skill tracking:** Lessons are tagged with skills (via `lesson_skills`). Skills belong to domains. Mastery percentages are derived at query time from graded submissions — no materialized scores tables.
- **Sort order:** Tables with `sort_order` use `max + 1` on create, no renumbering on delete, and explicit reorder endpoints that accept an ordered array of IDs.
- **Assessments:** MC questions are auto-scored on submit. Short answer and writing questions are teacher-graded via a separate grading endpoint.

### Query Patterns

- **Shape data via queries, not code.** Prefer using Drizzle's `columns`, `with`, and `where` options to return the correct shape directly from the database rather than fetching extra data and transforming it in application code (e.g., use `columns: { passwordHash: false }` instead of stripping fields after the query).
