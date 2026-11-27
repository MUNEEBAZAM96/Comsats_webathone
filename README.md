# Secure Examination Management System

A full-stack examination platform being developed for **Technoverse 5.0 – Web-e-Thon, COMSATS University Lahore**.

| Project | Details |
| --- | --- |
| Problem | Secure Examination Management System |
| Architecture | Next.js modular monolith |
| Language / package manager | TypeScript / npm |
| Current database | Supabase PostgreSQL through Prisma and the `pg` adapter |
| Innovation direction | Failure-Resilient Examinations — Challenge 5.3 |
| Current focus | Phase 10 secondary features and Phase 11 security testing (Phases 07–09 implemented and e2e-tested) |

This repository builds on an existing examination starter application. Authentication, dashboards, exam management, question banks, assignments, monitoring, automatic grading, supporting libraries (PDF/QR/CSV/XLSX/scratchpad/analytics/offline persistence), and report verification are implemented. The roadmap below distinguishes foundation work from remaining validation.

## Project objective

Build a secure, reliable, accessible platform for institutions and competition organizers that supports the complete examination lifecycle:

- Authentication and role-based authorization
- Examination configuration, scheduling, and publication
- Reusable question banks and candidate enrollment
- Examination delivery and monitoring
- Automatic and manual grading
- Controlled result publication and performance analytics
- Recovery from network interruptions without granting additional examination time

Manual grading and a separate examiner “publish results to candidates” gate remain planned refinements. Offline answer sync, verifiable PDF reports, bulk import/export, analytics charts, and the digital scratchpad are implemented.

## Roles

| Role | Stored role | Responsibilities |
| --- | --- | --- |
| Administrator | `admin` | Manage users, platform access, exams, question banks, imports/exports, reports, and results |
| Examiner | `examiner` | Create and manage own exams, assign candidates and proctors, import bank questions, and review results |
| Candidate | `student` | Access assigned exams, complete attempts (with scratchpad + offline answer persistence), and view available results |
| Proctor | `proctor` | Monitor assigned examinations and candidate progress |

The existing Proctor role is retained. Candidate is the product term for the existing `student` role; routes and database values have not been renamed.

## Technology stack

| Layer | Current implementation |
| --- | --- |
| Framework | Next.js 16.2+, App Router, Turbopack, Cache Components |
| Frontend | React 19.2 with React Compiler |
| Language | TypeScript with typed routes |
| Styling | Tailwind CSS 4, CSS-based theme configuration (`globals.css`) |
| UI | shadcn/ui (`base-luma`) with Base UI primitives |
| Authentication | Better Auth with database-backed sessions and cookies |
| Password hashing | Argon2id through `@node-rs/argon2` |
| Validation | Zod and `@t3-oss/env-nextjs` |
| Forms | React Hook Form |
| ORM | Prisma 7 (`@prisma/adapter-pg` + `pg`) |
| Database | PostgreSQL (Supabase) |
| Dates | date-fns (UTC storage; display helpers in `src/lib/date/`) |
| PDF reports | `@react-pdf/renderer` |
| Report QR codes | `qrcode` (URL-only payloads) |
| CSV / Excel | `papaparse` / `xlsx` |
| Charts | `recharts` |
| Scratchpad | HTML Canvas + `perfect-freehand` |
| Offline persistence | IndexedDB via `idb` |
| PDF text preview | `pdfjs-dist` (examiner-only; not required for core exams) |
| Icons / themes / toasts | Lucide React / next-themes / Sonner |
| Image processing | Sharp |
| Package manager | npm; lockfile committed |

Use the compatible versions in [package.json](./package.json) and [package-lock.json](./package-lock.json). Custom JWT authentication with `jose` is not the current architecture: retain Better Auth as the single authentication system.

## Architecture

```text
Browser: React UI, ExamPlayer, scratchpad, IndexedDB offline queue
                         |
Next.js: Server Components, Server Actions, Route Handlers
                         |
    Session checks, RBAC, Zod validation, exam lifecycle
                         |
                  Prisma + pg adapter
                         |
                 Supabase PostgreSQL
```

- One Next.js application, one database, and one authentication system.
- Server Components by default; Client Components for interactivity and browser APIs.
- Feature modules live under `src/features/` (reports, verification, imports/exports, analytics, scratchpad, exam-workspace offline, documents).
- Server-side authorization and input validation for every sensitive operation.
- Private pages check sessions/roles directly or through authorized data functions; layout redirects alone are insufficient.
- Public report verification is at `/verify/[reportId]` and never exposes candidate PII or answers.
- No microservices or direct browser-to-database access.

### Database configuration

The schema uses the PostgreSQL provider. The shared connection is in [dbClient.ts](./src/lib/database/dbClient.ts), and migration configuration is in [prisma.config.ts](./prisma.config.ts). Set `DATABASE_URL` to your Supabase PostgreSQL connection string, with `sslmode=require&uselibpqcompat=true`. URL-encode special characters in credentials (for example, `@` as `%40`).

Current validation accepts `postgresql://` or `postgres://`; local SQLite URLs are not supported. Active PostgreSQL migrations are under `prisma/migrations/`. Previous SQLite migration history is retained in `prisma/migrations_sqlite_archive/`. Existing SQLite data is not automatically transferred. Better Auth stores users, sessions, and accounts in the same PostgreSQL database.

Supporting-library tables:

| Model | Table | Purpose |
| --- | --- | --- |
| `ReportVerification` | `report_verification` | Published report id, SHA-256 content hash, public meta, revoke timestamp |
| `ImportJob` | `import_job` | Audit trail for CSV/XLSX imports and result exports |

Keep database credentials, dependencies, and generated output out of Git. Commit schema migrations and the npm lockfile.

## Local setup

### Prerequisites

- Node.js 24 or later
- npm 11 or later
- Git
- A Supabase PostgreSQL project and a valid `DATABASE_URL`

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

`BETTER_AUTH_URL` is also used when building public verification URLs for QR codes (`/verify/[reportId]`). Use the real public origin in deployed environments.

Avatar uploads use Cloudinary. Configure `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` in `.env`, and set `CLOUDINARY_FOLDER_MODE` to `dynamic` or `fixed` to match the Cloudinary account’s folder mode. Keep the API secret private; it is only used by server-side avatar upload and deletion actions.

### 3. Initialize and seed the database

```bash
npx prisma migrate deploy
npx prisma generate
npm run seed
```

The commands above apply committed PostgreSQL migrations and generate the Prisma client. For development schema changes, `npm run migrate` runs `prisma migrate dev` and generates the client; it may prompt for a migration name. Use a development database for schema development, and use migrations instead of `prisma db push`.

Optional remote connectivity check (reads schema + counts; creates and deletes a temporary `import_job` row):

```bash
npx tsx scripts/check-remote-db.ts
```

The seed creates four demo users, a Programming question-bank hierarchy, demo exam papers, assignments, proctors, and sample attempt/result data for a competition walkthrough.

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

## Supporting libraries (Phase 10)

Implemented under `src/features/` and wired into admin/student flows:

| Feature | Libraries | Where |
| --- | --- | --- |
| PDF candidate reports | `@react-pdf/renderer` | Admin result detail → publish report |
| QR verification | `qrcode` + SHA-256 (`node:crypto`) | `/verify/[reportId]`; QR encodes URL only |
| CSV / Excel import | `papaparse` / `xlsx` | Admin users (candidates), admin questions (bank) |
| CSV / Excel export | same | Admin exam results; candidate/bank exports |
| Analytics charts | `recharts` | Admin exam results page |
| Digital scratchpad | `perfect-freehand` + Canvas | Student `ExamPlayer` |
| Offline answers | `idb` | Student `ExamPlayer` + sync banner |
| PDF text preview | `pdfjs-dist` | Admin questions (examiner prep only) |
| Date helpers | `date-fns` | `src/lib/date/` |

Security notes:

- Report hashes are computed on the server; clients never supply a trusted hash.
- Import commits re-validate rows with Zod; candidate passwords are required (min 8).
- Spreadsheets are parsed with formulas disabled; exports sanitize formula-injection prefixes.
- Offline IndexedDB never stores passwords, tokens, or answer keys; the server remains authoritative for deadlines and ownership.
- Scratchpad strokes are local only and do not affect answers or the exam timer.

## Development roadmap

Work through phases in order, reusing existing implementations and validating each phase before treating it as complete.

### Phase 01 — Authentication and Authorization

**Existing:** Better Auth registration/login integration, password hashing, database sessions, protected layouts, role-specific redirects, and role permissions.

**Implement or validate:** Registration, login, logout, secure HttpOnly cookie behavior, session verification and expiry, server-side access checks, authentication forms, and error handling. Complete password-reset delivery if included in the demo; currently reset links are logged to the server console.

**Deliverable:** Validated authentication and protected experiences for `admin`, `examiner`, `student`, and `proctor`.

### Phase 02 — Application Layout and Dashboards

**Existing:** Four role dashboards, shared sidebar/header, navigation configuration, profile menu, and summary cards.

**Implement or refine:** Responsive application layout, role-specific navigation, accessible sidebar and mobile drawer, accurate header titles, profile/settings/sign-out menu, reusable dashboard components, and loading/empty/error states.

**Deliverable:** Distinct, working dashboards with a consistent visual system across mobile, tablet, and desktop.

### Phase 03 — Examination Management

**Done:** Instructions, `totalMarks`, draft-only edits, safer delete policy, publish guards, `completeExam`, and stored `draft|published|completed` with derived `ongoing` (`src/lib/exam/lifecycle.ts`).

**Deliverable:** Complete examination administration workflow.

### Phase 04 — Question Bank

**Done:** Difficulty, marking schemes, multi-select set grading, shuffle flags, random bank import, and `AttemptQuestion` snapshots for serving/grading active attempts. Subject → Topic → BankQuestion hierarchy with role-scoped UI.

**Deliverable:** Reusable question bank and reliable exam question management.

### Phase 05 — Candidate Management

**Existing:** User administration, exam assignments, student exam listings, assignment/time-window checks, and bulk candidate CSV/XLSX import (admin).

**Implement or validate:** Enrollment edge cases and available/upcoming/completed exam views under competition scenarios.

**Deliverable:** Complete candidate management workflow.

### Phase 06 — Examination Workspace

**Existing:** Question navigation, countdown, answer saving, answered indicators, submission confirmation, server-enforced duration/end time, mark-for-review UI, digital scratchpad, and offline answer queue.

**Validate:** Countdown alignment with the server effective deadline under clock skew, and expiry behavior when pending local answers remain.

**Deliverable:** Functional exam-taking experience with deadlines controlled by the server independently of the candidate device clock.

### Phase 07 — Failure-Resilient Examinations

**Innovation Challenge 5.3 — implemented foundation; validate under real network loss.**

Implemented: IndexedDB-first answer storage with per-question sequence numbers and idempotency keys, a batched sync queue with jittered backoff, server-side conflict rules (higher sequence wins; stale writes return the server copy), heartbeat with server time, a countdown-only timer, single-tab guard, attempt events, and finalisation that drops writes after the server deadline. Covered by `scripts/test-sync-queue.ts` and `scripts/e2e-phase07-09.ts` (offline recovery, aborted saves, second device conflict, offline deadline, skewed clock).

A fully offline reload opens a read-only recovery page for pending drafts in the current tab. Reconnect to resume answering while the server-controlled attempt is active.

**Deliverable:** Recoverable examination workflow under network interruptions without extending examination time.

### Phase 08 — Monitoring and Announcements

**Implemented:** One monitor for admins, owning examiners and assigned proctors (5 s polling with backoff): every assigned candidate including not-started, progress, server-time connection state (online / idle / offline), signal counts with a per-attempt timeline, human-recorded incidents (only owner/admin resolve), and announcements delivered to the workspace via heartbeat with read receipts and retraction. Monitoring indicators are labelled as automated signals and are not treated as proof of misconduct.

**Deliverable:** Authorized examination monitoring and communication.

### Phase 09 — Grading and Results

**Implemented:** Snapshot-based auto grading (single, multi with all-or-nothing / partial / partial-with-penalty, true/false, keyword short answer), `long_answer` and manual short answers marked in a grading workspace (quarter-point steps, feedback, anonymised mode), audited overrides and regrade, and a publication gate: candidates see nothing scored until results are published, then only what `resultReveal` allows. Analytics cover participation, score statistics, pass rate, histogram, item difficulty/discrimination and option frequency. Reports and CSV/XLSX exports use the final total.

**Deliverable:** Complete evaluation and controlled results workflow.

### Paper setting / Exam Builder

Admin and examiners author papers in a multi-step builder:

- Routes: `/admin|examiner/exams/[id]/builder` (and the exam detail page), plus `/preview` for a candidate-safe view (no answer keys, no attempt).
- Steps: details → question set → settings → review & publish.
- Question set: import from bank (filters + random), add manually, upload CSV/JSON with row-level validation and preview, sections (`ExamSection`), reorder with accessible move controls, undo remove.
- Settings expose only engine-backed options (schedule, shuffle, pass mark %, result reveal). Auto-submit and scratchpad remain in the student workspace.
- Publish uses `evaluatePublishReadiness` + existing `publishExam` ownership/lifecycle checks.
- Migration: `20261127180000_exam_sections_paper_setting`.
- Unit checks: `npx tsx scripts/test-paper-setting.ts`.

### Phase 10 — Secondary Features

Candidates can open an ungraded practice exam, set local workspace preferences, and keep private notes and drawings per attempt. The examination workspace queues edits in IndexedDB. If a candidate reloads offline, a recovery page shows pending drafts from the current tab. Reconnection restores the workspace while the attempt is active. The server rejects late writes and keeps its copy when an edit's sequence is equal to or lower than its saved version.

Admin can bulk-import candidates. Admin and examiners can import bank questions. CSV and XLSX previews show validation errors and duplicates without returning credentials or answer keys. Imports with invalid rows are rejected as a unit. Candidate files are limited to 100 rows, question files to 2,000 rows, and both to 2 MB.

Released candidate results and examination summaries can be rendered as PDFs. Staff-issued reports include a QR verification link and a SHA-256 digest for checking the issued file in the browser. Candidate names stay in authorized PDF views. Staff analytics include response counts, correct rates, skips, average scores, and topic, subject and difficulty performance. Older exam copies without taxonomy are shown as unclassified.

Phase 10 adds the `20261128120000_phase_ten_reports_and_taxonomy` migration and uses the existing database and Better Auth configuration. Set `BETTER_AUTH_URL` to the canonical HTTPS production origin so report QR links reach the deployment. Apply the migration before starting the updated app, after checking the target database's migration history. PDFs render in the Node.js server runtime and the browser checks file integrity over HTTPS or localhost.

### Phase 11 — Security and Testing

**Done (local prod verification):**
- Integration role-flow e2e (`scripts/e2e-integration-flows.ts`) — target ≥62/63, last green **65/65** with session-minted cookies (avoids Better Auth sign-in rate limits).
- Concurrency smoke (`scripts/e2e-concurrency-smoke.ts`) — parallel assign, parallel submit, higher `clientSeq` wins.
- Security checklist (`scripts/security-checklist.ts`) — S1–S13 PASS with code-audit + e2e evidence.
- Phase 07–09 regression (`scripts/e2e-phase07-09.ts`) — offline sync, monitor, grading, stale `clientSeq` via server action.
- Quality gates: `lint`, `typecheck`, `build`, `prisma migrate status`, `check-remote-db.ts`, unit scripts (`test-eligibility`, `test-grading`, `test-sync-queue`, `test-analytics`).
- Local prod log hygiene: no `DATABASE_URL` / connection strings in client bundles or terminal request logs. **Vercel Function log review** remains for Phase 12 after first preview deploy.

**Deliverable:** Tested, reliable application with documented verification results.

### Phase 12 — Deployment and Demonstration

**Local readiness (done):**
- `npm run lint` / `typecheck` / `build` pass
- `npx prisma migrate deploy` — schema up to date on Supabase
- `npm run seed` — demo users + bank + sample exams
- Cloudinary configured for avatars (no Vercel filesystem uploads)
- `vercel.json` pins install/build commands and Node-friendly Next.js settings
- `npx tsx scripts/check-deploy-readiness.ts` validates required env keys (never prints values)

**Vercel deploy (operator steps — requires `npx vercel login`):**

1. Log in and link the project:
   ```bash
   npx vercel login
   npx vercel link
   ```
2. In the Vercel project settings, set **Node.js 24.x**.
3. Add these env vars for **Preview** and **Production** (never commit them):

   | Variable | Notes |
   | --- | --- |
   | `DATABASE_URL` | Supabase URI + `sslmode=require&uselibpqcompat=true` |
   | `BETTER_AUTH_SECRET` | ≥32 chars; keep stable (used with Argon2) |
   | `BETTER_AUTH_URL` | Canonical **HTTPS** deploy origin |
   | `BETTER_AUTH_ALLOWED_ORIGINS` | Same origin(s), comma-separated |
   | `BETTER_AUTH_TELEMETRY` | `0` |
   | `CHECKPOINT_DISABLE` | `1` |
   | `CLOUDINARY_CLOUD_NAME` / `API_KEY` / `API_SECRET` / `FOLDER_MODE` | Required for avatars |

4. Deploy:
   ```bash
   npx vercel          # preview
   npx vercel --prod   # production
   ```
5. After the first URL is known, set `BETTER_AUTH_URL` + `BETTER_AUTH_ALLOWED_ORIGINS` to that `https://…` origin and **redeploy** (cookies, sessions, and QR verify links depend on it).
6. Apply DB migrations/seed from a trusted machine (not the Vercel build):
   ```bash
   npx prisma migrate deploy
   npm run seed
   ```
7. Post-deploy: complete the checklist in [docs/deploy-verification.md](./docs/deploy-verification.md). Review **Vercel Function logs** after login + one exam submit — no `DATABASE_URL`, secrets, or answer keys.

**Live deployment:**
- Production URL: [https://comsats-webathone.vercel.app](https://comsats-webathone.vercel.app)
- Vercel project: `ali-akbar-zaidis-projects/comsats-webathone`
- Env includes Supabase + Better Auth + Cloudinary; `BETTER_AUTH_URL` set to the production HTTPS origin
- GitHub auto-connect was skipped (repo ownership differs from the Vercel account). Deploy with `npx vercel --prod` / `npx vercel redeploy …`
- If a deploy is blocked with `TEAM_ACCESS_REQUIRED`, use `npx vercel redeploy <url> --non-interactive` or invite the commit author to the Vercel team
- Complete [docs/deploy-verification.md](./docs/deploy-verification.md) on the live URL (auth → exam → monitor → results → log hygiene)

## Current development status

| Phase | Source-code status |
| --- | --- |
| 01 — Authentication | Foundation implemented; validation and hardening required |
| 02 — Dashboards | Existing UI; refinement and responsive verification pending |
| 03 — Examination management | Implemented lifecycle (`draft` / `published` / `completed` + derived `ongoing`) |
| 04 — Question bank | Implemented hierarchy, marking schemes, snapshots, bank import |
| 05 — Candidate management | Foundation + bulk import; workflow validation pending |
| 06 — Examination workspace | Implemented with scratchpad and offline queue; timer skew validation pending |
| 07 — Failure resilience | IndexedDB sync foundation implemented; field validation pending |
| 08 — Monitoring | Implemented (monitor, incidents, announcements) |
| 09 — Grading and results | Implemented (auto + manual + publish gate + analytics) |
| 10 — Secondary features | Implemented and integrated |
| 11 — Security and testing | Local verification complete (e2e + checklist + gates); Vercel log review deferred to first deploy |
| 12 — Deployment | Live at https://comsats-webathone.vercel.app; finish deploy-verification checklist |

**Current focus: run the live demo checklist in docs/deploy-verification.md and disable Deployment Protection if judges need public access.**

## Project structure

```text
prisma/
  schema.prisma             Database models (incl. ReportVerification, ImportJob)
  migrations/               Versioned PostgreSQL migrations
  seed.ts                   Demo users and question bank
scripts/
  check-remote-db.ts        Optional Supabase connectivity / schema smoke check
src/
  app/
    api/auth/[...all]/       Better Auth HTTP handler
    verify/[reportId]/       Public report verification page
    (public)/               Login, registration, password reset pages
    (private)/
      admin/                Administration dashboard and workflows
      examiner/             Examiner dashboard and workflows
      proctor/              Assigned-exam monitoring and results
      student/              Candidate exams and results
      settings/             Shared authenticated account settings
  components/               Shared and role-specific UI
    shadcnui/               Base UI-backed primitives
  features/
    analytics/              Recharts exam analytics
    documents/              PDF text preview (pdfjs)
    exam-workspace/offline/ IndexedDB answers + sync
    exports/                CSV/XLSX export builders
    imports/                CSV/XLSX import parse + UI
    reports/                PDF templates and publish UI
    scratchpad/             Digital scratchpad
    verification/           Hash + QR helpers
  hooks/                    React hooks
  lib/
    auth.ts                 Better Auth server configuration
    auth-client.ts          Authentication client
    auth/permissions.ts     Role permission definitions
    database/dbClient.ts    Shared Prisma client
    date/                   Display and exam-time helpers
    env/                    Environment validation
    exam/                   Lifecycle, grading, marking schemes
    zodSchema.ts            Form/input schemas
  server/                   Business operations and Server Actions
    session.ts              Shared page-level session and role checks
    reportActions.ts        Publish PDF/QR reports (admin/examiner)
    verifyReport.ts         Server-only public verification (not a client action)
    importExportActions.ts  Authorized import/export
    analyticsActions.ts     Authorized analytics payloads
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
12. Do not change the database provider away from Supabase PostgreSQL without explicit approval.

### Existing question-storage conventions

- Options are newline-separated plain text, not JSON.
- Multiple-select responses join selected option text with newlines.
- Multi-select grading uses set equality with optional partial credit (`src/lib/exam/grading.ts`).
- Short-answer grading uses marking-scheme keywords (legacy: comma-separated `answer`).
- Importing from the bank copies question fields into the exam; it does not retain a bank foreign key.
- `startExam` freezes `AttemptQuestion` snapshots; student serving and auto-grading use those rows only.
- Exam time windows are enforced in `startExam` / `saveAnswer`; new attempts require `effectiveStatus === "ongoing"` after `syncExamLifecycle`.

See [schema.prisma](./prisma/schema.prisma), [lifecycle.ts](./src/lib/exam/lifecycle.ts), and [studentExamActions.ts](./src/server/studentExamActions.ts).

## Demonstration preparation

After seeding, use the Administrator or Examiner account to create an exam, import bank questions, assign the Candidate and Proctor, configure an available time window, and publish it. Sign in as the Candidate to complete an attempt (optionally toggle offline to exercise IndexedDB sync) and as the Proctor to inspect progress. From Admin results, export CSV/XLSX, review analytics, and publish a verifiable PDF report; open the QR URL on `/verify/[reportId]`.

This is a preparation checklist, not a claim of completed end-to-end competition testing.

## Attribution and license

Built on [open-exam-web](https://github.com/MrSaikatS/open-exam-web) by Saikat Sardar and adapted for this competition project. The starter code is licensed under the [MIT License](./LICENSE); its copyright notice is preserved.
