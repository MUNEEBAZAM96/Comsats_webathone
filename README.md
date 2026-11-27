# Secure Examination Management System

A full-stack examination platform being developed for **Technoverse 5.0 – Web-e-Thon, COMSATS University Lahore**.

| Project | Details |
| --- | --- |
| Problem | Secure Examination Management System |
| Architecture | Next.js modular monolith |
| Language / package manager | TypeScript / npm |
| Current database | Local SQLite through Prisma and the libSQL adapter |
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

| Layer               | Technology                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Framework**       | Next.js 16.2 (App Router, Turbopack, React Compiler)                                                        |
| **React**           | 19.2, Server Components, `typedRoutes: true`                                                                |
| **Styling**         | Tailwind v4 (`@theme` in CSS, no `tailwind.config.ts`), shadcn/ui `base-luma` (`@base-ui/react` primitives) |
| **Database**        | SQLite via Prisma 7 + `@prisma/adapter-libsql`                                                              |
| **Auth**            | Better Auth 1.6 (email/password, admin plugin, 4 roles)                                                     |
| **Forms**           | react-hook-form + Zod (`@t3-oss/env-nextjs`)                                                                |
| **Package Manager** | npm >=11                                                                                                    |

## ✅ Prerequisites

- Node.js 24 or later
- npm 11 or later
- Git

SQLite is accessed through the installed libSQL dependencies; a separate database server is not required.

### 1. Install dependencies

```bash
git clone https://github.com/MUNEEBAZAM96/Comsats_webathone.git
cd Comsats_webathone
npm ci
```

### 2. Configure the environment

Create a `.env` file in the project root with the following values. An `.env.example` file is not currently included.

```dotenv
DATABASE_URL="file:./prisma/dev.db"
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
npm run migrate
npm run seed
```

The migration script runs `prisma migrate dev` and generates the Prisma client. When introducing schema changes, it may prompt for a migration name. Use migrations instead of `prisma db push`.

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
| Proctor  | `proctor@example.com`  | `proctor@example.com`  |
| Student  | `student@example.com`  | `student@example.com`  |

## 📜 Available Scripts

| Command         | Description                                                |
| --------------- | ---------------------------------------------------------- |
| `npm run dev`       | Start Turbopack dev server                                 |
| `npm run build`     | Generate Prisma client + production build                  |
| `npm run start`     | Start production server                                    |
| `npm run lint`      | Run ESLint                                                 |
| `npm run typecheck` | Run `tsc --noEmit`                                         |
| `npm run prod`      | Full production pipeline (generate + lint + build + start) |
| `npm run migrate`   | Run `prisma migrate dev` + generate client                 |
| `npm run studio`    | Open Prisma Studio (headless — open the printed URL)       |
| `npm run seed`      | Seed database with test data                               |

## ✨ Features

### 👤 Role-Based Access

- **Admin** — Full access: create/manage exams, question bank, users, view all results
- **Examiner** — Create and manage own exams, manage question bank (no delete), view own exam results
- **Proctor** — Monitor live exam progress, view student attempt statuses
- **Student** — View assigned exams, take exams (with auto-save & timer), view results

### 🔄 Exam Lifecycle

1. **Create** — Examiners/Admins create exams with title, duration, time window
2. **Questions** — Build a question bank, then import questions into exams (copy-on-import)
3. **Assign** — Assign exams to students
4. **Proctor** — Proctors monitor student progress in real-time (2s polling)
5. **Take** — Students take exams with auto-save, question navigation, and auto-submit on timer expiry. Time windows (`startTime`/`endTime`) are enforced server-side.
6. **Grade** — Auto-grading for multiple choice, true/false, short answer (keyword-based)
7. **Review** — Students and examiners can review results per-question

### ❓ Question Types

- **Single Choice** — Radio buttons, one correct answer
- **Multiple Choice** — Checkboxes, multiple correct options joined with newline
- **True/False** — Radio buttons with True/False options
- **Short Answer** — Text input, graded by keyword matching

## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   └── (private)/          # Authenticated layout (gated by middleware)
│       ├── admin/          # Admin dashboard, exams, questions, results, users
│       ├── examiner/       # Examiner dashboard, exams, questions, results
│       ├── proctor/        # Proctor dashboard (exam monitoring)
│       └── student/        # Student dashboard, exams (take), results
├── components/
│   ├── Dashboard/          # StatCard, DashboardShellSkeleton
│   ├── Examiner/           # ExaminerShellSkeleton
│   ├── Exam/               # ExamForm, ExamsTable, QuestionsManager
│   ├── Proctor/            # ProctorExamMonitor (live polling)
│   ├── Results/            # StatusBadge, PctBadge
│   ├── Student/            # ExamPlayer, QuestionCard, ResultReview, ExamStatusBadge, AttemptBadge
│   └── shadcnui/           # shadcn/ui primitives
├── hooks/                  # Custom React hooks
├── lib/
│   ├── env/                # T3 env validation (serverEnv, clientEnv)
│   ├── database/           # Prisma singleton (dbClient.ts)
│   ├── auth.ts             # Better Auth server config
│   ├── auth-client.ts      # Better Auth client config
│   └── zodSchema.ts        # All Zod schemas and inferred types
└── server/actions/         # Server actions (exam, bank, studentExam, assignment, proctor, results)
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
