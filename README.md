# Secure Examination Management System

A full-stack examination platform being developed for **Technoverse 5.0 – Web-e-Thon, COMSATS University Lahore**.

| Project | Details |
| --- | --- |
| Problem | Secure Examination Management System |
| Architecture | Next.js modular monolith |
| Language / package manager | TypeScript / npm |
| Current database | Supabase PostgreSQL through Prisma and the pg adapter |
| Innovation direction | Failure-Resilient Examinations — Challenge 5.3 |
| Current focus | Validate and strengthen Phase 01: Authentication and Authorization |

This repository builds on an existing examination starter application. Authentication, dashboards, exam management, assignments, monitoring, and automatic grading already have implementations. The roadmap below distinguishes that foundation from planned functionality; implementation presence does not mean a phase has passed end-to-end validation.

## Project objective

Build a secure, reliable, accessible platform for institutions and competition organizers that supports the complete examination lifecycle:

- Authentication and role-based authorization
- Examination configuration, scheduling, and publication
- Reusable question banks and candidate enrollment
- Examination delivery and monitoring
- Automatic and manual grading
- Controlled result publication and performance analytics
- Recovery from network interruptions without granting additional examination time

Manual grading, controlled result publication, and failure-resilient answer synchronization are planned work, not completed features.

## Roles

| Role | Stored role | Responsibilities |
| --- | --- | --- |
| Administrator | `admin` | Manage users, platform access, exams, question banks, and results |
| Examiner | `examiner` | Create and manage own exams, assign candidates and proctors, and review results |
| Candidate | `student` | Access assigned exams, complete attempts, and view available results |
| Proctor | `proctor` | Monitor assigned examinations and candidate progress |

The existing Proctor role is retained. Candidate is the product term for the existing `student` role; routes and database values have not been renamed.

## Technology stack

| Layer | Current implementation |
| --- | --- |
| Framework | Next.js 16.2, App Router, Turbopack |
| Frontend | React 19.2 with React Compiler |
| Language | TypeScript with typed routes |
| Styling | Tailwind CSS 4, CSS-based theme configuration |
| UI | shadcn/ui with Base UI primitives |
| Authentication | Better Auth with database-backed sessions and cookies |
| Password hashing | Argon2id through `@node-rs/argon2` |
| Validation | Zod and `@t3-oss/env-nextjs` |
| Forms | React Hook Form |
| ORM | Prisma 7 |
| Database | PostgreSQL (Supabase) through `@prisma/adapter-pg` and `pg` |
| Icons / dates | Lucide React / date-fns |
| Themes / notifications | next-themes / React Toastify |
| Image processing | Sharp |
| Package manager | npm; lockfile committed |

Use the compatible versions in [package.json](./package.json) and [package-lock.json](./package-lock.json). Custom JWT authentication with `jose` is not the current architecture: retain Better Auth as the single authentication system. Recharts is not installed; charting is a future choice if analytics requires it.

## Architecture

```text
Browser: React UI and interactive client components
                         |
Next.js: Server Components, Server Actions, Route Handlers
                         |
          Session checks, authorization, validation
                         |
                  Prisma + pg adapter
                         |
                 Supabase PostgreSQL
```

- One Next.js application, one database, and one authentication system.
- Server Components by default; Client Components for interactivity and browser APIs.
- Reusable UI components and shared server-side business logic.
- Route Handlers for HTTP endpoints and Server Actions for appropriate mutations.
- Server-side authorization and input validation for sensitive operations.
- Private pages check sessions/roles directly or through authorized data functions; layout redirects alone are insufficient.
- No microservices or direct browser-to-database access.

### Database configuration

The schema uses the PostgreSQL provider. The shared connection is in [dbClient.ts](./src/lib/database/dbClient.ts), and migration configuration is in [prisma.config.ts](./prisma.config.ts). Set `DATABASE_URL` to your Supabase PostgreSQL connection string, with `sslmode=require&uselibpqcompat=true`. URL-encode special characters in credentials (for example, `@` as `%40`).

Current validation accepts `postgresql://` or `postgres://`; local SQLite URLs are no longer supported. PostgreSQL migrations are under `prisma/migrations/`, with previous SQLite migration history retained in `prisma/migrations_sqlite_archive/`. Existing SQLite data is not automatically transferred by this change. Better Auth stores users, sessions, and accounts in the same PostgreSQL database.

Keep database files, credentials, dependencies, and generated output out of Git. Commit schema migrations and the npm lockfile.

## Local setup

### Prerequisites

- Node.js 24 or later
- npm 11 or later
- Git

A Supabase PostgreSQL project and a valid database connection string are required for the current configuration.

### 1. Install dependencies

```bash
git clone https://github.com/MUNEEBAZAM96/Comsats_webathone.git
cd Comsats_webathone
npm ci
```

### 2. Configure the environment

Copy `.env.example` to `.env` and configure the following values:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require&uselibpqcompat=true"
BETTER_AUTH_SECRET="replace-with-a-generated-secret-at-least-32-characters-long"
BETTER_AUTH_URL="http://localhost:3000"
BETTER_AUTH_ALLOWED_ORIGINS="http://localhost:3000"
BETTER_AUTH_TELEMETRY="0"
CHECKPOINT_DISABLE="1"
# Optional; defaults to admin@example.com
BETTER_AUTH_SEED_ADMIN_EMAIL="admin@example.com"
```

Generate your own secret, for example with:

```bash
openssl rand -base64 32
```

Replace the placeholder before running the application. Keep the secret stable: the current password hashing implementation also uses it as an Argon2 secret, so changing it affects verification of existing passwords. Never commit `.env`.

### 3. Initialize and seed the database

```bash
npx prisma migrate deploy
npx prisma generate
npm run seed
```

The commands above apply committed PostgreSQL migrations and generate the Prisma client. For development schema changes, `npm run migrate` runs `prisma migrate dev` and generates the client; it may prompt for a migration name. Use a development database for schema development, and use migrations instead of `prisma db push`.

The seed creates four demo users and a Programming question-bank hierarchy with ten questions. It does not provide a complete assigned-exam demonstration scenario.

### 4. Start the application

```bash
npm run dev
```

Open [localhost:3000](http://localhost:3000).

### Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@example.com` | `admin@example.com` |
| Examiner | `examiner@example.com` | `examiner@example.com` |
| Proctor | `proctor@example.com` | `proctor@example.com` |
| Candidate | `student@example.com` | `student@example.com` |

These credentials are for fictional local/demo data only. If the administrator email is overridden, its seeded password is that email. Running the seed again resets the seeded account passwords.

## Development commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server |
| `npm run typecheck` | Generate Next.js route types and run TypeScript without emitting files |
| `npm run lint` | Run ESLint |
| `npm run build` | Generate Prisma client and build for production |
| `npm run start` | Start an existing production build |
| `npm run prod` | Generate Prisma client, build, and start; does not run lint |
| `npm run migrate` | Apply development migrations and generate Prisma client |
| `npm run seed` | Seed demo users and bank questions |
| `npm run studio` | Start Prisma Studio without automatically opening a browser |

After significant changes, run:

```bash
npm run lint
npm run typecheck
npm run build
```

Successful checks do not replace role-based, timing, concurrency, or network-interruption testing.

## Development roadmap

Work through phases in order, reusing existing implementations and validating each phase before treating it as complete.

### Phase 01 — Authentication and Authorization

**Existing:** Better Auth registration/login integration, password hashing, database sessions, protected layouts, role-specific redirects, and role permissions.

**Implement or validate:** Registration, login, logout, secure HttpOnly cookie behavior, session verification and expiry, server-side access checks, authentication forms, and error handling. Complete password-reset delivery if included in the demo; currently reset links are logged to the server console.

**Deliverable:** Validated authentication and protected experiences for `admin`, `examiner`, `student`, and `proctor`.

### Phase 02 — Application Layout and Dashboards

**Existing:** Four role dashboards, shared sidebar/header, navigation configuration, profile menu, and summary cards.

**Implement or refine:** Responsive application layout, role-specific navigation, accessible sidebar and mobile drawer, accurate header titles, profile/settings/sign-out menu, reusable dashboard components, and loading/empty/error states.

| Dashboard | UI priority |
| --- | --- |
| Administrator | Platform metrics, user distribution, exam overview, recent activity |
| Examiner | Own exams, preparation actions, draft/published overview, question-bank shortcuts |
| Proctor | Assigned exams, candidate progress, direct monitoring access |
| Candidate | Resume or available-exam action, upcoming exams, recent results |

**Deliverable:** Distinct, working dashboards with a consistent visual system across mobile, tablet, and desktop. Display real available data and preserve existing authorization boundaries.

### Phase 03 — Examination Management

**Existing:** Exam creation/editing, deletion rules, description, schedule, duration, and publication.

**Implement or validate:** Instructions, marks derived from questions, draft deletion, publication readiness, and a consistent lifecycle covering **DRAFT → PUBLISHED → ONGOING → COMPLETED**. The current persisted workflow primarily uses lowercase `draft` and `published`; the four-state lifecycle is a target.

**Deliverable:** Complete examination administration workflow.

### Phase 04 — Question Bank

**Existing:** Subject → Topic → BankQuestion hierarchy, single-choice/multiple-choice/true-false/short-answer questions, points, editing, and copy-based import into exams.

**Implement or validate:** Difficulty levels, written-response requirements, marking schemes, randomization, and stable question/answer-choice ordering. Preserve questions and marking schemes for active attempts. Bank-to-exam copying already creates exam copies; immutable per-attempt snapshots need explicit validation/design.

**Deliverable:** Reusable question bank and reliable exam question management.

### Phase 05 — Candidate Management

**Existing:** User administration, exam assignments, student exam listings, and assignment/time-window checks.

**Implement or validate:** Candidate registration and management, enrollment, eligibility, and available/upcoming/completed exam views.

**Deliverable:** Complete candidate management workflow.

### Phase 06 — Examination Workspace

**Existing:** Question navigation, countdown, answer saving, answered indicators, submission confirmation, and client-triggered submission at timer expiry.

**Implement or validate:** Mark for review, clear save status, refresh recovery, consistent submission handling, and a countdown aligned with the server deadline. The server already checks duration and exam end time when saving; the client countdown still needs alignment with that effective deadline.

**Deliverable:** Functional exam-taking experience with deadlines controlled by the server independently of the candidate device clock.

### Phase 07 — Failure-Resilient Examinations

**Innovation Challenge 5.3 — planned.**

Implement network connectivity detection, IndexedDB persistence, a local answer queue, automatic synchronization, retry handling, explicit conflict handling, refresh recovery, server-controlled deadlines, and clear synchronization status.

Persist unsynchronized changes locally and distinguish saved-on-device from acknowledged-by-server answers. Define and test the policy for unsynchronized answers at expiry; a client timestamp alone must not authorize late writes or additional time.

**Deliverable:** Recoverable examination workflow under network interruptions without extending examination time. Current autosave alone does not meet this requirement.

### Phase 08 — Monitoring and Announcements

**Existing:** Proctor assignments, candidate progress, attempt statuses, and polling-based monitoring.

**Implement or validate:** Active monitoring, incident recording, examiner announcements, and monitoring dashboards. Monitoring indicators must not be treated as conclusive proof of misconduct.

**Deliverable:** Authorized examination monitoring and communication.

### Phase 09 — Grading and Results

**Existing:** Automatic grading, score calculation, and role-scoped result views.

**Implement or validate:** Explicit multiple-select marking rules, manual written-response grading, examiner review, controlled result publication, candidate access, and examination analytics.

Current choice grading compares normalized answer text; short answers use keyword matching. Students can view submitted results without a separate examiner publication step. These behaviors need refinement to meet this phase.

**Deliverable:** Complete evaluation and controlled results workflow.

### Phase 10 — Secondary Features

Implement and integrate all eight required features:

1. Network-aware interface
2. PDF report generation
3. Examination sandbox
4. Bulk candidate/question import
5. Question analytics
6. Verifiable reports
7. Customizable examination workspace
8. Digital scratchpad

**Deliverable:** Working secondary functionality, not placeholder controls. The complete feature set is not currently implemented.

### Phase 11 — Security and Testing

Verify server-side authorization, Zod input validation, password security, answer-key protection, duplicate-submission handling, deadlines, data integrity, and recoverable errors. Test all roles, unauthorized direct action calls, concurrent saves/submissions, refreshes, clock changes, and network interruptions.

Review assignment/proctor lookup authorization as well as page-level protection. No automated project test suite has been identified in the current repository.

**Deliverable:** Tested, reliable application with documented verification results.

### Phase 12 — Deployment and Demonstration

Prepare production builds, persistent database configuration, upload storage, deployment, fictional exam data, test accounts, documentation, and a repeatable demonstration workflow. Current avatars are written to the local filesystem, which also needs a deployment storage decision.

**Deliverable:** Deployed application ready for the competition. Deployment is not yet verified. Required features must remain usable without paid APIs, paid keys, or billing-required services, following the competition rules.

## Current development status

| Phase | Source-code status |
| --- | --- |
| 01 — Authentication | Foundation implemented; validation and hardening required |
| 02 — Dashboards | Existing UI; refinement and responsive verification pending |
| 03 — Examination management | Partial; full lifecycle pending |
| 04 — Question bank | Partial; difficulty/randomization and snapshot validation pending |
| 05 — Candidate management | Foundation implemented; workflow validation pending |
| 06 — Examination workspace | Partial; review markers and timer/save reliability work pending |
| 07 — Failure resilience | Planned |
| 08 — Monitoring | Partial; incidents and announcements pending |
| 09 — Grading and results | Partial; manual grading and result publication pending |
| 10 — Secondary features | Planned; complete set not implemented |
| 11 — Security and testing | Safeguards exist; systematic verification pending |
| 12 — Deployment | Scripts and seed data exist; deployment unverified |

**Current focus: validate Phase 01 before advancing through the roadmap.** Existing later-phase code is a foundation to assess and improve, not evidence that those phases are complete.

## Project structure

```text
prisma/
  schema.prisma             Database models
  migrations/               Versioned SQL migrations
  seed.ts                   Demo users and question bank
src/
  app/
    api/auth/[...all]/       Better Auth HTTP handler
    (public)/               Login, registration, password reset pages
    (private)/
      admin/                Administration dashboard and workflows
      examiner/             Examiner dashboard and workflows
      proctor/              Assigned-exam monitoring and results
      student/              Candidate exams and results
      settings/             Shared authenticated account settings
  components/               Shared and role-specific UI
    shadcnui/               Base UI-backed primitives
  hooks/                    React hooks
  lib/
    auth.ts                 Better Auth server configuration
    auth-client.ts          Authentication client
    auth/permissions.ts     Role permission definitions
    database/dbClient.ts    Shared Prisma client
    env/                    Environment validation
    zodSchema.ts            Form/input schemas
  server/                   Business operations and Server Actions
    session.ts              Shared page-level session and role checks
generated/prisma/           Generated client; excluded from Git
```

## Development rules

1. Complete and validate one phase at a time; reuse working starter code.
2. Follow [AGENTS.md](./AGENTS.md) and read the relevant installed Next.js documentation before framework changes.
3. Keep documentation synchronized with implementation and distinguish planned features from working ones.
4. Use npm and preserve the lockfile; avoid unnecessary dependencies.
5. Keep credentials, answer keys, and sensitive operations on the server.
6. Enforce authorization on every sensitive server operation, not only in navigation or layouts.
7. Validate incoming inputs with Zod and keep business logic separate from UI.
8. Use shared UI components and accessible responsive layouts; do not leave nonfunctional placeholders.
9. Use migrations for schema changes and the shared Prisma singleton for application queries.
10. Run lint, typecheck, and build after significant changes; add meaningful workflow/security tests.
11. Demonstrate with fictional data and follow the competition submission deadline.

### Existing question-storage conventions

- Options are newline-separated plain text, not JSON.
- Multiple-select responses join selected option text with newlines.
- Current objective grading compares normalized strings; define improved multi-select rules before changing storage or grading.
- Short-answer grading currently uses comma-separated keywords.
- Importing from the bank copies question fields into the exam; it does not retain a bank foreign key.

See [schema.prisma](./prisma/schema.prisma) and [studentExamActions.ts](./src/server/studentExamActions.ts) for the current implementation.

## Demonstration preparation

After seeding, use the Administrator or Examiner account to create an exam, import bank questions, assign the Candidate and Proctor, configure an available time window, and publish it. Sign in as the Candidate to complete an attempt and as the Proctor to inspect progress. Review the resulting scores with the appropriate role.

This is a preparation checklist, not a claim of completed end-to-end testing. Extend it with offline recovery, manual grading, publication, and report verification as those phases are implemented.

## Attribution and license

Built on [open-exam-web](https://github.com/MrSaikatS/open-exam-web) by Saikat Sardar and adapted for this competition project. The starter code is licensed under the [MIT License](./LICENSE); its copyright notice is preserved.
