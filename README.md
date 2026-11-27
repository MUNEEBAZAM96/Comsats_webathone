<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://img.shields.io/badge/open--exam--web-0a0a0a?style=for-the-badge&logo=nextdotjs&logoColor=white">
    <img alt="open-exam-web" src="https://img.shields.io/badge/open--exam--web-ffffff?style=for-the-badge&logo=nextdotjs&logoColor=black">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/MrSaikatS/open-exam-web/stargazers">
    <img src="https://img.shields.io/github/stars/MrSaikatS/open-exam-web?style=for-the-badge&logo=github&color=gold" alt="GitHub Stars">
  </a>
  <a href="https://github.com/MrSaikatS/open-exam-web/issues">
    <img src="https://img.shields.io/github/issues/MrSaikatS/open-exam-web?style=for-the-badge&logo=github" alt="GitHub Issues">
  </a>
  <a href="https://github.com/MrSaikatS/open-exam-web/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/MrSaikatS/open-exam-web?style=for-the-badge&logo=github" alt="License">
  </a>
</p>

<p align="center">
  ⭐ If you find this project useful, consider giving it a star — it helps others discover it!
</p>

A modern, role-based online examination platform built with Next.js 16. Supports **admin**, **examiner**, **proctor**, and **student** roles with a full exam lifecycle — creation, assignment, proctoring, taking, and auto-graded results.

---

## 🧰 Tech Stack

| Layer               | Technology                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Framework**       | Next.js 16.2 (App Router, Turbopack, React Compiler)                                                        |
| **React**           | 19.2, Server Components, `typedRoutes: true`                                                                |
| **Styling**         | Tailwind v4 (`@theme` in CSS, no `tailwind.config.ts`), shadcn/ui `base-luma` (`@base-ui/react` primitives) |
| **Database**        | PostgreSQL (Supabase) via Prisma 7 + `@prisma/adapter-pg` + `pg`                                            |
| **Auth**            | Better Auth 1.7 (email/password, admin plugin, 4 roles)                                                     |
| **Forms**           | react-hook-form + Zod (`@t3-oss/env-nextjs`)                                                                |
| **Package Manager** | npm >=11                                                                                                    |

## ✅ Prerequisites

- Node.js >=24 with npm >=11
- A Supabase Postgres project and a `DATABASE_URL` with SSL (`sslmode=require&uselibpqcompat=true`)

## 🚀 Getting Started

```bash
git clone https://github.com/MrSaikatS/open-exam-web.git
cd open-exam-web
```

### 📦 Install Dependencies

```bash
npm install
```

### 🔐 Environment Variables

Copy the example env file:

```bash
cp .env.example .env
```

Edit `.env` with your values:

| Variable                       | Description                                       | Default                 |
| ------------------------------ | ------------------------------------------------- | ----------------------- |
| `DATABASE_URL`                 | Supabase Postgres URL (encode `@` in password as `%40`) | `postgresql://USER:PASSWORD@HOST:5432/postgres?sslmode=require&uselibpqcompat=true` |
| `BETTER_AUTH_SECRET`           | Auth secret (generate: `openssl rand -base64 32`) | —                       |
| `BETTER_AUTH_URL`              | Base URL of the app                               | `http://localhost:3000` |
| `BETTER_AUTH_ALLOWED_ORIGINS`  | CORS origins (comma-separated)                    | `http://localhost:3000` |
| `BETTER_AUTH_SEED_ADMIN_EMAIL` | Admin email used by seed script                   | `admin@example.com`     |
| `BETTER_AUTH_TELEMETRY`        | Disable Better Auth telemetry                     | `0`                     |
| `CHECKPOINT_DISABLE`           | Disable Prisma telemetry                          | `1`                     |

### 🗄️ Database Setup

Point `DATABASE_URL` at your Supabase Postgres instance (see `.env.example`). Auth (Better Auth) stores users/sessions/accounts in the same database.

```bash
# Apply Postgres migrations and generate Prisma client
npx prisma migrate deploy
npx prisma generate

# Or interactive local migrate (prompts for a name):
npm run migrate

# Seed with test data (4 users + 10 programming bank questions)
npm run seed
```

### 🏃 Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 👥 Seed Users

After running `npm run seed`, you can log in with:

| Role     | Email                  | Password               |
| -------- | ---------------------- | ---------------------- |
| Admin    | `admin@example.com`    | `admin@example.com`    |
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
│   └── (private)/          # Signed-in area (layouts redirect; each page checks the session via src/server/session.ts)
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

## 🗄️ Database Models (10)

- **User** — Core user with role (`admin`, `examiner`, `proctor`, `student`)
- **Session / Account / Verification** — Better Auth authentication tables
- **Exam** — Exam metadata (title, duration, time window, status)
- **BankQuestion** — Reusable question bank (created by examiners/admins)
- **Question** — Exam-specific copy of a bank question (snapshot on import)
- **ExamAssignment** — Student-exam assignments
- **ExamProctor** — Proctor-exam assignments
- **ExamAttempt** — Student attempt tracking (status, scores, timestamps)
- **Answer** — Per-question student answer with auto-score

## 🔧 Prisma

- Schema: `prisma/schema.prisma` (`provider = "postgresql"`)
- Client output: `generated/prisma/` (gitignored)
- Import: `import { PrismaClient } from "@generated/prisma/client"`
- Singleton: `src/lib/database/dbClient.ts` (`PrismaPg` + `pg` Pool)
- No `datasource.url` in schema — URL injected via `prisma.config.ts` from env
- Postgres migrations under `prisma/migrations/`; archived SQLite history in `prisma/migrations_sqlite_archive/`

## 📐 Key Conventions

- Question options/answers stored as **newline-separated text** (not JSON)
- Multiple choice student answers: option texts joined with `\n`
- Short answer grading: comma-separated keywords with proportional scoring
- Exam time windows (`startTime`/`endTime`) enforced server-side in `startExam` and `saveAnswer`
- Server actions in `src/server/actions/` — each file is `"use server"` with session + ownership checks
- Exam questions use **bank-first approach**: import copies from bank, edit/delete on exam copy only
- All date work uses `date-fns` (`format`, `isAfter`, `isBefore`) — avoid native `Date` operators and `toLocaleDateString`
- Form pattern: react-hook-form + `Controller` + Zod resolver + shadcn `Field`/`Input`

## 🤝 Contributing

We welcome contributions! Here's how you can help:

1. 🍴 Fork the repository
2. 🌿 Create a feature branch: `git checkout -b feat/amazing-feature`
3. 💻 Make your changes
4. ✅ Run typecheck and lint: `npm run typecheck && npm run lint`
5. 📝 Commit using [conventional commits](https://www.conventionalcommits.org/)
6. 🚀 Open a Pull Request

Check the [issues page](https://github.com/MrSaikatS/open-exam-web/issues) for bugs or feature requests.

## ⭐ Support

If you find this project helpful, please give it a ⭐ on GitHub — it helps others find it and motivates us to keep improving!

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/MrSaikatS">Saikat Sardar</a>
  <br>
  ⭐ Star · 🐛 Report Bug · 💡 Suggest Feature
</p>
