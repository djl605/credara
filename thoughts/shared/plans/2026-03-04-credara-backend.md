# Credara Backend Implementation Plan

## Overview

Implement the complete backend for Credara, a media literacy LMS for schools. The backend is a TypeScript/Fastify REST API backed by PostgreSQL, supporting hierarchical user roles (superadmin, admin, teacher, student), lesson management, assessments, assignments, and student progress tracking.

## Current State Analysis

Greenfield project — only a product spec (`credara.md`) exists. No code, no infrastructure.

## Desired End State

A fully functional REST API that supports all Credara Classroom features:
- Authentication & role-based authorization
- School, class, and user management (with CSV roster import)
- Lesson browsing with filtering/sorting, collections, and favorites
- Assessment creation and student submission with teacher grading
- Assignment management
- Derived student progress/mastery tracking
- Badge domain model

### Verification
- All endpoints tested with integration tests
- Role-based access enforced and tested
- Database schema supports all product requirements from `credara.md`

## What We're NOT Doing

- Frontend / UI
- Chrome extension (Credara Companion)
- Google Classroom roster integration (deferred)
- Teacher guides / vocab words (deferred)
- Badge auto-trigger logic (domain model only)
- AI-assisted grading
- Media file hosting (embeds only)
- Email/notification system
- CI/CD pipelines (can add later)

## Tech Stack

| Concern          | Choice                                                    | Rationale                                                                                                |
|------------------|-----------------------------------------------------------|----------------------------------------------------------------------------------------------------------|
| Runtime          | Node.js + TypeScript                                      | Type safety, large ecosystem, shared language with future frontend                                       |
| Framework        | Fastify                                                   | High performance, built-in schema validation support, plugin architecture                                |
| ORM              | Drizzle ORM                                               | Type-safe, schema-in-code, lightweight, SQL-like API — pairs well with Fastify + Zod                     |
| Database         | PostgreSQL                                                | Robust, supports array types (grade_levels), strong ecosystem, Cloud SQL managed option                  |
| Validation       | Zod (via `fastify-type-provider-zod`)                     | Integrates with both Drizzle schema inference and Fastify route validation                               |
| Auth             | Session-based (bcrypt + httpOnly cookies + sessions table) | FERPA compliance favors minimizing third-party data sharing (e.g. Auth0); simpler than JWT refresh flows |
| Testing          | Vitest                                                    | Fast, TypeScript-native, compatible with ESM                                                             |
| Migrations       | Drizzle Kit                                               | Auto-generates migrations from schema changes, pairs with Drizzle ORM                                    |
| Containerization | Docker (multi-stage build)                                | Portable across hosting providers, reproducible builds                                                   |
| Hosting          | GCP Cloud Run + Cloud SQL (Postgres)                      | Simple deploy (docker-based), auto-scales, managed Postgres with backups, strong compliance              |
| Local Dev        | docker-compose (Postgres) + tsx watch (app)               | Postgres in container for consistency; app runs natively for instant hot reload                          |

## Local Development

During local development:
- **Postgres** runs in a Docker container via `docker-compose.yml`
- **The app** runs natively on the host via `tsx watch src/index.ts` for instant hot reload — no container rebuild needed on code changes
- `.env` points `DATABASE_URL` to `localhost:5432` for the Dockerized Postgres

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: credara
      POSTGRES_PASSWORD: credara
      POSTGRES_DB: credara
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

Workflow:
1. `docker compose up -d` — start Postgres
2. `npm run migrate` — apply migrations
3. `npm run seed` — seed dev data
4. `npm run dev` — start the app with hot reload

## Deployment

### Docker

Multi-stage `Dockerfile` for production builds:

```dockerfile
# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/drizzle ./drizzle
EXPOSE 8080
CMD ["node", "dist/index.js"]
```

### GCP Cloud Run + Cloud SQL

**Why Cloud Run:**
- Deploy a Docker container with `gcloud run deploy` — minimal config
- Auto-scales horizontally (including to zero for cost savings)
- Handles tens of thousands of users without replatforming
- No cluster/VM management — fully managed
- Strong compliance posture (FERPA BAAs available)

**Why Cloud SQL over self-managed Postgres:**
- Automated backups and point-in-time recovery
- High availability option when needed
- Managed patching and maintenance
- Connection via Cloud SQL Auth Proxy (secure, no public IP needed)

**Setup (one-time):**
1. Create GCP project
2. Enable Cloud Run and Cloud SQL APIs
3. Create Cloud SQL Postgres instance
4. Deploy via `gcloud run deploy --source .` (builds from Dockerfile)

**Environment variables** set via Cloud Run configuration:
- `DATABASE_URL` — Cloud SQL connection string (via Auth Proxy)
- `SESSION_SECRET` — from GCP Secret Manager
- `NODE_ENV=production`
- `PORT=8080` (Cloud Run default)

**Scaling config:**
- `min-instances: 1` to avoid cold starts (a few dollars/month)
- `max-instances: 10` as a safety cap (adjustable)
- Cloud Run auto-scales within these bounds based on request concurrency

## Database Schema

### Enums

```
user_role: 'superadmin' | 'admin' | 'teacher' | 'student'
subject: 'ela' | 'social_studies' | 'journalism' | 'earth_science'
skill_domain: 'media_literacy' | 'critical_thinking' | 'reading_comprehension' | 'written_expression' | 'digital_citizenship' | 'ai_literacy'
question_type: 'multiple_choice' | 'short_answer' | 'writing'
media_type: 'article' | 'video' | 'podcast'
submission_status: 'in_progress' | 'submitted' | 'graded'
```

### Sort Order Convention

Several tables have a `sort_order` column (media_sources, collection_lessons, assessments, assessment_questions, question_choices). These work as follows:
- **On create:** new items get `max(sort_order) + 1` by default
- **On delete:** no renumbering — gaps are fine
- **Reordering:** done via explicit reorder endpoints (e.g., `PUT /api/assessments/:id/questions/reorder`) that accept an ordered array of IDs and set all sort_orders in a single transaction

This avoids the complexity of maintaining sort_order on every insert/delete.

### Tables

**users**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK, default gen_random_uuid() |
| email | varchar(255) | unique, not null |
| password_hash | varchar(255) | not null |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**user_school_roles**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| user_id | uuid | FK → users, not null |
| school_id | uuid | FK → schools, nullable (superadmins have no school) |
| role | user_role enum | not null |
| first_name | varchar(100) | not null |
| last_name | varchar(100) | not null |
| created_at | timestamptz | default now() |

Unique constraint on (user_id, school_id, role). A user can have multiple roles across schools (e.g., student at one school, teacher at another) or even multiple roles within the same school. Name is scoped here since an individual may go by different names in different contexts.

**sessions**

| Column | Type | Notes |
|--------|------|-------|
| id | varchar(255) | PK (session token) |
| user_id | uuid | FK → users, not null |
| user_school_role_id | uuid | FK → user_school_roles, not null |
| expires_at | timestamptz | not null |
| created_at | timestamptz | default now() |

The session is scoped to a specific school+role context, chosen at login. `request.user` in auth middleware provides both the user and their active context. To switch context, the user must log out and log in again.

**schools**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | varchar(255) | not null |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**classes**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | varchar(255) | not null |
| school_id | uuid | FK → schools, not null |
| teacher_id | uuid | FK → users, not null |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**class_students**

| Column | Type | Notes |
|--------|------|-------|
| class_id | uuid | FK → classes, PK |
| student_id | uuid | FK → users, PK |

**skill_domains**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | varchar(100) | unique, not null |
| created_at | timestamptz | default now() |

**skills**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | varchar(100) | not null |
| domain_id | uuid | FK → skill_domains, not null |
| created_at | timestamptz | default now() |

Unique constraint on (name, domain_id).

**lessons**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| title | varchar(255) | not null |
| description | text | not null |
| image_url | varchar(500) | nullable |
| subject | subject enum | not null |
| grade_levels | smallint[] | not null (e.g. `{7,8,9}`) |
| created_by | uuid | FK → users, not null |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**lesson_skills**

| Column | Type | Notes |
|--------|------|-------|
| lesson_id | uuid | FK → lessons, PK |
| skill_id | uuid | FK → skills, PK |

Skills link to domains, so lesson → domain tagging is derived through lesson_skills → skills → skill_domains.

**media_sources**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| lesson_id | uuid | FK → lessons, not null |
| type | media_type enum | not null |
| title | varchar(255) | not null |
| url | varchar(500) | not null |
| sort_order | smallint | not null, default 0 |

**collections**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | varchar(255) | unique, not null |
| description | text | nullable |
| image_url | varchar(500) | nullable |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**collection_lessons**

| Column | Type | Notes |
|--------|------|-------|
| collection_id | uuid | FK → collections, PK |
| lesson_id | uuid | FK → lessons, PK |
| sort_order | smallint | not null, default 0 |

**assessments**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| lesson_id | uuid | FK → lessons, not null |
| title | varchar(255) | not null |
| sort_order | smallint | not null, default 0 |
| created_at | timestamptz | default now() |

**assessment_questions**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| assessment_id | uuid | FK → assessments, not null |
| type | question_type enum | not null |
| question_text | text | not null |
| sort_order | smallint | not null, default 0 |

**question_choices**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| question_id | uuid | FK → assessment_questions, not null |
| choice_text | varchar(500) | not null |
| is_correct | boolean | not null, default false |
| sort_order | smallint | not null, default 0 |

**assignments**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| lesson_id | uuid | FK → lessons, not null |
| class_id | uuid | FK → classes, not null |
| assigned_by | uuid | FK → users, not null |
| due_date | timestamptz | nullable |
| created_at | timestamptz | default now() |

For individual student assignments, the teacher assigns to a class — all students in the class receive it. If individual targeting is needed later, we can add an `assignment_students` override table.

**submissions**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| assignment_id | uuid | FK → assignments, not null |
| student_id | uuid | FK → users, not null |
| status | submission_status enum | not null, default 'in_progress' |
| submitted_at | timestamptz | nullable |
| graded_at | timestamptz | nullable |
| created_at | timestamptz | default now() |

Unique constraint on (assignment_id, student_id).

**submission_answers**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| submission_id | uuid | FK → submissions, not null |
| question_id | uuid | FK → assessment_questions, not null |
| answer_text | text | nullable (for short_answer/writing) |
| selected_choice_id | uuid | FK → question_choices, nullable (for MC) |
| score | numeric(5,2) | nullable (set by teacher when grading) |
| max_score | numeric(5,2) | not null |
| feedback | text | nullable |

Unique constraint on (submission_id, question_id).

**teacher_favorites**

| Column | Type | Notes |
|--------|------|-------|
| teacher_id | uuid | FK → users, PK |
| lesson_id | uuid | FK → lessons, PK |
| created_at | timestamptz | default now() |

**badge_definitions**

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| name | varchar(100) | unique, not null |
| description | text | nullable |
| icon_url | varchar(500) | nullable |
| created_at | timestamptz | default now() |

**student_badges**

| Column | Type | Notes |
|--------|------|-------|
| student_id | uuid | FK → users, PK |
| badge_id | uuid | FK → badge_definitions, PK |
| earned_at | timestamptz | default now() |

### Key Indexes

- `users(email)` — unique
- `user_school_roles(user_id)` — look up roles for a user
- `user_school_roles(school_id)` — list users in a school
- `user_school_roles(user_id, school_id, role)` — unique
- `classes(school_id)` — list classes in a school
- `classes(teacher_id)` — list teacher's classes
- `lessons(subject)` — filter by subject
- `assignments(class_id)` — list class assignments
- `submissions(student_id)` — list student submissions
- `submissions(assignment_id, student_id)` — unique lookup

## API Endpoints

### Auth
```
POST   /api/auth/login              # email + password + school/role context → set session cookie
POST   /api/auth/logout             # clear session
GET    /api/auth/me                 # get current user + active context
```

Login flow: client sends email + password. If the user has multiple school/role associations, the response includes the list and the client must re-request with the chosen `user_school_role_id`. If only one association exists, the session is created immediately.

### Users
```
POST   /api/users                   # create user (role-scoped: superadmin creates admins, admin creates teachers, teacher creates students)
GET    /api/users                   # list users (scoped by role + school)
GET    /api/users/:id               # get user detail
PATCH  /api/users/:id               # update user
POST   /api/users/import-csv        # bulk CSV roster import
```

### Schools
```
POST   /api/schools                 # superadmin only
GET    /api/schools                 # superadmin: all; admin/teacher: own school
GET    /api/schools/:id
PATCH  /api/schools/:id
```

### Classes
```
POST   /api/classes                 # teacher+ creates class
GET    /api/classes                 # teacher: own classes; admin: school classes
GET    /api/classes/:id             # class detail with roster
PATCH  /api/classes/:id
POST   /api/classes/:id/students    # add student(s) to class
DELETE /api/classes/:id/students/:studentId  # remove student
```

### Skill Domains & Skills
```
GET    /api/skill-domains           # list all domains
POST   /api/skill-domains           # superadmin: create domain
GET    /api/skill-domains/:id/skills # list skills in domain
POST   /api/skills                  # superadmin: create skill
```

### Lessons
```
POST   /api/lessons                 # superadmin only
GET    /api/lessons                 # list with filters (subject, grade, domain, collection) + sorting
GET    /api/lessons/:id             # full lesson detail (includes media, assessments)
PATCH  /api/lessons/:id             # superadmin only
DELETE /api/lessons/:id             # superadmin only
```

### Media Sources
```
POST   /api/lessons/:lessonId/media     # add media source
PATCH  /api/media/:id                   # update
DELETE /api/media/:id                   # remove
```

### Collections
```
POST   /api/collections             # superadmin only
GET    /api/collections              # list all
GET    /api/collections/:id          # detail with lessons
PATCH  /api/collections/:id
POST   /api/collections/:id/lessons  # add lesson to collection
DELETE /api/collections/:id/lessons/:lessonId
```

### Favorites
```
POST   /api/favorites/:lessonId      # toggle favorite on
DELETE /api/favorites/:lessonId      # toggle favorite off
GET    /api/favorites                # list teacher's favorites
```

### Assessments
```
POST   /api/lessons/:lessonId/assessments          # create assessment
PATCH  /api/assessments/:id                        # update
DELETE /api/assessments/:id                        # delete
POST   /api/assessments/:id/questions              # add question (with choices if MC)
PATCH  /api/questions/:id                          # update question
DELETE /api/questions/:id                          # delete question
```

### Assignments
```
POST   /api/assignments              # assign lesson to class
GET    /api/assignments              # list (teacher: own classes; student: own)
GET    /api/assignments/:id          # detail with student statuses
DELETE /api/assignments/:id
```

### Submissions
```
POST   /api/assignments/:assignmentId/submissions        # student starts/submits
GET    /api/submissions/:id                              # get submission detail
PATCH  /api/submissions/:id                              # update answers (while in_progress)
POST   /api/submissions/:id/submit                       # finalize submission
POST   /api/submissions/:id/grade                        # teacher grades (scores + feedback per answer)
```

### Progress (derived, read-only)
```
GET    /api/students/:id/progress                  # overall mastery, domain breakdown, skill breakdown
GET    /api/classes/:id/progress                   # class averages, per-student mastery
GET    /api/classes/:id/progress/:domainId         # domain-specific with Big 5 breakdown
```

### Badges
```
GET    /api/badge-definitions        # list all badge types
POST   /api/badge-definitions        # superadmin: create
GET    /api/students/:id/badges      # list earned badges
```

## Implementation Approach

Feature-based directory structure. Each feature module contains its own routes, handlers, and service logic. Shared concerns (auth, db, middleware) live in `src/lib/`.

```
Dockerfile                      # multi-stage production build
docker-compose.yml              # local dev (Postgres)
.dockerignore
src/
├── index.ts                    # app entrypoint
├── app.ts                      # fastify app setup + plugin registration
├── db/
│   ├── index.ts                # drizzle client
│   ├── schema.ts               # all drizzle table definitions
│   └── migrations/             # generated by drizzle-kit
├── lib/
│   ├── auth.ts                 # password hashing, session management
│   ├── middleware.ts            # requireAuth, requireRole decorators
│   ├── errors.ts               # error types + handler
│   └── csv.ts                  # CSV parsing for roster import
├── features/
│   ├── auth/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── users/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── schools/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── classes/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── skills/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── lessons/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── collections/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── favorites/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── assessments/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── assignments/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── submissions/
│   │   ├── routes.ts
│   │   └── service.ts
│   ├── progress/
│   │   ├── routes.ts
│   │   └── service.ts
│   └── badges/
│       ├── routes.ts
│       └── service.ts
└── test/
    ├── setup.ts                # test db setup/teardown
    ├── helpers.ts              # factories, auth helpers
    └── integration/
        ├── auth.test.ts
        ├── users.test.ts
        ├── lessons.test.ts
        └── ...
```

## Authorization Model

Middleware-based approach with two layers:

1. **`requireAuth`** — validates session cookie, loads user + active `user_school_role` context, attaches both to `request.user`
2. **`requireRole(minimumRole)`** — checks `request.user.role` (from the session's active context) against hierarchy: `student < teacher < admin < superadmin`

Role-specific scoping uses the session's `school_id` from the active context:
- Teachers see only their own classes and students within their school
- Admins see all classes/teachers/students within their school
- Superadmins see everything (no school scope)

The hierarchy means `requireRole('teacher')` allows teacher, admin, and superadmin.

---

## Phase 1: Project Setup & Foundation

### Overview
Scaffold the TypeScript/Fastify project, configure tooling, establish database connection, set up Docker for local dev, and set up the testing infrastructure.

### Changes Required:

#### 1. Initialize project
- `package.json` with scripts (dev, build, test, migrate, seed)
- `tsconfig.json` (strict mode, ESM)
- `.env` / `.env.example` for DATABASE_URL, SESSION_SECRET, PORT
- `.gitignore` (node_modules, dist, .env)

#### 2. Install dependencies
**Runtime:** `fastify`, `@fastify/cookie`, `@fastify/cors`, `drizzle-orm`, `postgres` (pg driver), `zod`, `fastify-type-provider-zod`, `bcrypt`, `dotenv`

**Dev:** `typescript`, `vitest`, `drizzle-kit`, `tsx`, `@types/bcrypt`, `@types/node`

#### 3. Docker setup
- `docker-compose.yml` — Postgres 16 container for local dev (see Local Development section)
- `Dockerfile` — multi-stage production build (see Deployment section)
- `.dockerignore` — exclude node_modules, dist, .env, .git

#### 4. Create app scaffold
- `src/index.ts` — starts server
- `src/app.ts` — creates Fastify instance, registers plugins (cookie, cors, zod type provider), error handler
- `src/db/index.ts` — Drizzle client from DATABASE_URL
- `src/lib/errors.ts` — AppError class + Fastify error handler

#### 5. Test infrastructure
- `vitest.config.ts`
- `src/test/setup.ts` — test database creation/teardown
- `src/test/helpers.ts` — stub for test utilities

### Success Criteria:

#### Automated Verification:
- [ ] `npm run build` compiles without errors
- [ ] `docker compose up -d` starts Postgres successfully
- [ ] `npm run dev` starts server and responds to `GET /health` with `{ status: "ok" }`
- [ ] `npm test` runs and passes (even if just a smoke test)
- [ ] Database connection succeeds on startup
- [ ] `docker build .` builds production image successfully

#### Manual Verification:
- [ ] Project structure matches the layout described above

**Implementation Note**: After completing this phase and all automated verification passes, pause here for confirmation before proceeding.

---

## Phase 2: Database Schema & Migrations

### Overview
Define all Drizzle schema tables and generate/run the initial migration.

### Changes Required:

#### 1. Schema definition
**File:** `src/db/schema.ts`

Define all tables as described in the Database Schema section above, using Drizzle's `pgTable`, `pgEnum`, etc.

#### 2. Generate and run migration
```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

#### 3. Seed data script
**File:** `src/db/seed.ts`

Seed:
- Skill domains (Media Literacy, Critical Thinking, Reading Comprehension, Written Expression, Digital Citizenship, AI Literacy)
- A few skills per domain
- A test school
- One user of each role (for development)
- A couple of badge definitions

### Success Criteria:

#### Automated Verification:
- [ ] Migration runs cleanly against an empty database
- [ ] `npm run seed` populates seed data without errors
- [ ] Schema matches all tables defined in the plan

#### Manual Verification:
- [ ] Tables visible in psql with correct columns, types, and constraints

**Implementation Note**: Pause for confirmation before proceeding.

---

## Phase 3: Auth & User Management

### Overview
Implement session-based authentication, role-based authorization middleware, and user CRUD endpoints.

### Changes Required:

#### 1. Auth utilities
**File:** `src/lib/auth.ts`
- `hashPassword(password)` — bcrypt hash
- `verifyPassword(password, hash)` — bcrypt compare
- `createSession(userId, userSchoolRoleId)` — insert into sessions table, return token
- `deleteSession(token)` — delete from sessions
- `getSession(token)` — look up session + joined user + user_school_role, check expiry

#### 2. Auth middleware
**File:** `src/lib/middleware.ts`
- `requireAuth` — Fastify preHandler hook: reads session cookie, validates, attaches `request.user`
- `requireRole(role)` — preHandler hook: checks `request.user.role` against hierarchy

#### 3. Auth routes
**File:** `src/features/auth/routes.ts`
```
POST /api/auth/login    — validate credentials; if one context, create session; if multiple, return contexts for selection
POST /api/auth/logout   — delete session, clear cookie
GET  /api/auth/me       — return current user + active school/role context
```

#### 4. User routes
**File:** `src/features/users/routes.ts`
```
POST   /api/users        — create user (role-scoped creation)
GET    /api/users         — list users (filtered by role, scoped by school)
GET    /api/users/:id     — get user detail
PATCH  /api/users/:id     — update user
```

Role-scoped creation rules (creates a user + a `user_school_roles` entry):
- Superadmin can create admins (must specify school_id)
- Admin can create teachers (auto-assigned to admin's active school)
- Teacher can create students (auto-assigned to teacher's active school)

If the user already exists (by email), just add a new `user_school_roles` entry rather than creating a duplicate user. If an entry already exists for that email + school + role combination, return the existing record (no duplicates).

#### 5. Integration tests
**File:** `src/test/integration/auth.test.ts`
- Login with valid/invalid credentials
- Session persistence across requests
- Logout invalidates session
- Protected route rejects unauthenticated requests

**File:** `src/test/integration/users.test.ts`
- Role-scoped user creation
- Users scoped correctly per role
- Cannot escalate privileges

### Success Criteria:

#### Automated Verification:
- [ ] Auth integration tests pass
- [ ] User CRUD tests pass
- [ ] Role hierarchy enforced in tests

#### Manual Verification:
- [ ] Can log in via curl/httpie and access protected endpoints

**Implementation Note**: Pause for confirmation before proceeding.

---

## Phase 4: School & Class Management

### Overview
CRUD for schools and classes, class enrollment, and CSV roster import.

### Changes Required:

#### 1. School routes
**File:** `src/features/schools/routes.ts`
```
POST   /api/schools       — superadmin only
GET    /api/schools        — scoped list
GET    /api/schools/:id
PATCH  /api/schools/:id
```

#### 2. Class routes
**File:** `src/features/classes/routes.ts`
```
POST   /api/classes                        — create class (teacher+)
GET    /api/classes                        — list classes (scoped)
GET    /api/classes/:id                    — detail with roster
PATCH  /api/classes/:id
POST   /api/classes/:id/students           — enroll student(s)
DELETE /api/classes/:id/students/:studentId — unenroll
```

#### 3. CSV roster import
**File:** `src/lib/csv.ts` — parse CSV (first_name, last_name, email columns)
**File:** `src/features/users/routes.ts` — add `POST /api/users/import-csv`
- Accepts multipart CSV file upload
- Creates student accounts with generated temporary passwords
- Returns created users + any errors (duplicate emails, etc.)

#### 4. Integration tests
- School CRUD with role enforcement
- Class creation, roster management
- CSV import: happy path + error cases

### Success Criteria:

#### Automated Verification:
- [ ] School CRUD tests pass with role enforcement
- [ ] Class CRUD + enrollment tests pass
- [ ] CSV import creates users correctly and reports errors

#### Manual Verification:
- [ ] CSV import with a sample file works end-to-end

**Implementation Note**: Pause for confirmation before proceeding.

---

## Phase 5: Skills, Lessons, Collections & Favorites

### Overview
Implement the content layer: skill domains/skills, lesson CRUD with filtering/sorting, collections, and teacher favorites.

### Changes Required:

#### 1. Skill domain & skill routes
**File:** `src/features/skills/routes.ts`
```
GET    /api/skill-domains
POST   /api/skill-domains              — superadmin
GET    /api/skill-domains/:id/skills
POST   /api/skills                     — superadmin
```

#### 2. Lesson routes
**File:** `src/features/lessons/routes.ts`
```
POST   /api/lessons                    — superadmin (lesson builder)
GET    /api/lessons                    — list with filters + sorting
GET    /api/lessons/:id                — full detail
PATCH  /api/lessons/:id                — superadmin
DELETE /api/lessons/:id                — superadmin
```

Filtering: `subject`, `grade` (any overlap with grade_levels array), `domain` (via lesson_skills → skills → domain), `collection`.
Sorting: `most_recent` (created_at desc), `grade_level`, `domain`.
`most_assigned` requires a count join on assignments — implement as a subquery.

#### 3. Media source routes
**File:** `src/features/lessons/routes.ts` (nested)
```
POST   /api/lessons/:lessonId/media
PATCH  /api/media/:id
DELETE /api/media/:id
```

#### 4. Collection routes
**File:** `src/features/collections/routes.ts`
```
POST   /api/collections
GET    /api/collections
GET    /api/collections/:id
PATCH  /api/collections/:id
POST   /api/collections/:id/lessons
DELETE /api/collections/:id/lessons/:lessonId
```

#### 5. Favorites routes
**File:** `src/features/favorites/routes.ts`
```
POST   /api/favorites/:lessonId
DELETE /api/favorites/:lessonId
GET    /api/favorites
```

#### 6. Integration tests
- Lesson CRUD, filtering, sorting
- Collection management
- Favorites toggle

### Success Criteria:

#### Automated Verification:
- [ ] Lesson CRUD with superadmin enforcement passes
- [ ] Filtering by subject, grade, domain, collection works
- [ ] Sorting by most_recent, most_assigned, grade_level, domain works
- [ ] Collection CRUD passes
- [ ] Favorites toggle passes

#### Manual Verification:
- [ ] Complex filter combinations return correct results

**Implementation Note**: Pause for confirmation before proceeding.

---

## Phase 6: Assessments & Submissions

### Overview
Assessment/question CRUD within lessons, student submission flow, and teacher grading.

### Changes Required:

#### 1. Assessment routes
**File:** `src/features/assessments/routes.ts`
```
POST   /api/lessons/:lessonId/assessments
PATCH  /api/assessments/:id
DELETE /api/assessments/:id
POST   /api/assessments/:id/questions      — include choices for MC type
PATCH  /api/questions/:id
DELETE /api/questions/:id
```

#### 2. Submission routes
**File:** `src/features/submissions/routes.ts`
```
POST   /api/assignments/:assignmentId/submissions   — student starts
GET    /api/submissions/:id                         — get with answers
PATCH  /api/submissions/:id                         — save answers (while in_progress)
POST   /api/submissions/:id/submit                  — finalize (status → submitted)
POST   /api/submissions/:id/grade                   — teacher sets scores + feedback per answer
```

Grading sets `status → graded`, `graded_at`, and individual `score` + `feedback` on each `submission_answer`. For MC questions, auto-score is applied on submit (correct = max_score, incorrect = 0).

#### 3. Integration tests
- Create assessment with mixed question types
- Student submission lifecycle (start → save → submit)
- MC auto-scoring
- Teacher grading flow
- Cannot submit after already submitted
- Cannot grade a non-submitted submission

### Success Criteria:

#### Automated Verification:
- [ ] Assessment CRUD tests pass
- [ ] Full submission lifecycle test passes
- [ ] MC auto-scoring verified
- [ ] Teacher grading flow verified
- [ ] Edge cases (double submit, grade before submit) handled

#### Manual Verification:
- [ ] End-to-end flow: create lesson → add assessment → assign → student submits → teacher grades

**Implementation Note**: Pause for confirmation before proceeding.

---

## Phase 7: Assignments

### Overview
Assignment CRUD — assigning lessons to classes.

### Changes Required:

#### 1. Assignment routes
**File:** `src/features/assignments/routes.ts`
```
POST   /api/assignments                — teacher assigns lesson to class
GET    /api/assignments                — list (teacher: own classes; student: own)
GET    /api/assignments/:id            — detail with per-student submission status
DELETE /api/assignments/:id
```

When listing for students, include submission status (not started / in progress / submitted / graded).
When listing for teachers, include aggregate stats (submitted count, graded count).

#### 2. Integration tests
- Teacher creates assignment
- Students see their assignments
- Assignment detail shows student statuses
- Deletion behavior

### Success Criteria:

#### Automated Verification:
- [ ] Assignment CRUD tests pass
- [ ] Student/teacher scoping verified
- [ ] Submission status aggregation correct

#### Manual Verification:
- [ ] Assignment appears for all students in the class

**Implementation Note**: Pause for confirmation before proceeding.

---

## Phase 8: Progress Tracking & Analytics

### Overview
Derived progress/mastery endpoints computed from graded submissions. No materialized tables — computed at query time.

### Changes Required:

#### 1. Progress routes
**File:** `src/features/progress/routes.ts`
```
GET /api/students/:id/progress                 — overall + domain + skill breakdown
GET /api/classes/:id/progress                  — class averages, per-student summary
GET /api/classes/:id/progress/:domainId        — domain-specific Big 5 breakdown
```

#### 2. Progress service
**File:** `src/features/progress/service.ts`

Mastery computation logic:
1. Find all graded submissions for the student
2. For each submission_answer, get the associated question → assessment → lesson → skills
3. Aggregate `score / max_score` per skill, per domain
4. Return percentages at each level

For class progress:
- Aggregate per-student mastery across all students in the class
- Compute class averages

#### 3. Student profile data
The `GET /api/students/:id/progress` endpoint returns:
- Overall mastery percentage
- Per-domain mastery
- Per-skill (Big 5) mastery within each domain
- Recent assignments with scores
- Earned badges
- Strengths (top skills) and areas for growth (bottom skills)

#### 4. Integration tests
- Student with graded submissions shows correct mastery
- Class averages computed correctly
- Domain-specific breakdown accurate
- Empty state (no submissions) handled

### Success Criteria:

#### Automated Verification:
- [ ] Student progress computation correct with test data
- [ ] Class progress aggregation correct
- [ ] Domain-specific breakdown accurate
- [ ] Edge cases (no data, partial data) handled

#### Manual Verification:
- [ ] Progress numbers make intuitive sense with sample data

**Implementation Note**: Pause for confirmation before proceeding.

---

## Phase 9: Badges (Domain Model Only)

### Overview
Badge definitions and earned badge records. No auto-trigger logic — just the CRUD.

### Changes Required:

#### 1. Badge routes
**File:** `src/features/badges/routes.ts`
```
GET    /api/badge-definitions          — list all
POST   /api/badge-definitions          — superadmin creates
GET    /api/students/:id/badges        — list earned
POST   /api/students/:id/badges        — manually award (superadmin/admin)
```

#### 2. Integration tests
- Badge definition CRUD
- Award badge to student
- List student badges

### Success Criteria:

#### Automated Verification:
- [ ] Badge CRUD tests pass
- [ ] Badge awarding works
- [ ] Duplicate badge prevention

#### Manual Verification:
- [ ] Badges appear in student profile/progress endpoint

**Implementation Note**: After completing all phases, the backend is feature-complete per the product spec.

---

## Testing Strategy

### Unit Tests:
- Password hashing/verification
- CSV parsing
- Mastery computation logic

### Integration Tests:
- Each feature module has integration tests
- Tests use a real test database (created/torn down per suite)
- Test helpers provide factories for creating test users, schools, classes, lessons, etc.
- Auth helper to get authenticated session for any role

### Test Organization:
```
src/test/
├── setup.ts           # create/drop test DB
├── helpers.ts         # factories + auth helpers
└── integration/
    ├── auth.test.ts
    ├── users.test.ts
    ├── schools.test.ts
    ├── classes.test.ts
    ├── lessons.test.ts
    ├── assessments.test.ts
    ├── assignments.test.ts
    ├── submissions.test.ts
    ├── progress.test.ts
    └── badges.test.ts
```

## Performance Considerations

- Lesson listing with filters uses indexed columns
- Progress computation is derived at query time — acceptable for MVP; can add materialized scores table later if needed
- `most_assigned` sort requires a COUNT subquery on assignments — add index on `assignments(lesson_id)`
- Pagination on all list endpoints (cursor-based or offset-based)

## Migration Notes

N/A — greenfield project.

## References

- Product spec: `credara.md`
