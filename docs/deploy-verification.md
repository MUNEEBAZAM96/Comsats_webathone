# Deploy verification & competition demo

Use this after the first Vercel preview/production URL is live.  
**Never paste secrets, connection strings, or answer keys into this file.**

## Environment

- [ ] `BETTER_AUTH_URL` equals the public HTTPS origin
- [ ] `BETTER_AUTH_ALLOWED_ORIGINS` includes that origin
- [ ] Cloudinary vars present (avatar upload works)
- [ ] `npx prisma migrate deploy` applied against Supabase
- [ ] `npm run seed` completed

Demo accounts (password = email unless admin email overridden):

| Role | Email |
| --- | --- |
| Admin | `admin@example.com` |
| Examiner | `examiner@example.com` |
| Proctor | `proctor@example.com` |
| Student | `student@example.com` |

## Auth

- [ ] Admin → `/admin`
- [ ] Examiner → `/examiner`
- [ ] Proctor → `/proctor`
- [ ] Student → `/student`
- [ ] Wrong password rejected
- [ ] Logout / missing cookie returns to `/`

## Exam builder

- [ ] Create draft exam
- [ ] Import bank questions + create question
- [ ] Reorder / edit exam copy only
- [ ] Publish blocked until checklist valid, then publish succeeds
- [ ] Examiner cannot edit another examiner’s exam

## Student attempt

- [ ] Assigned exam visible; unassigned hidden
- [ ] Cannot start before window
- [ ] Answer single / multi / T-F / short / long
- [ ] Refresh keeps answers
- [ ] Submit works; no answer keys in workspace payloads

## Proctor / grading / results

- [ ] Assigned proctor opens monitor; unassigned denied
- [ ] Grade long answer if pending
- [ ] Approve / override AI written grade in grading workspace
- [ ] Publish results; student sees gated then revealed score
- [ ] Student `/student/results` + `/student/reports` + `/student/reports/weekly`
- [ ] Analytics / CSV export if used in demo

## AI grading (optional Groq)

- [ ] `GROQ_API_KEY` set server-side only (never `NEXT_PUBLIC_`)
- [ ] With key missing / `AI_GRADING_ENABLED=false`: objective grades still work; written stays pending manual
- [ ] With key set: submit → written answers get provisional AI grade; examiner must review before treating as final
- [ ] Retry from grading UI does not overwrite examiner overrides

## Phase 10 extras

- [ ] `/student/practice` loads
- [ ] Scratchpad does not change timer/answers
- [ ] Verifiable PDF + `/verify/[reportId]` uses deployed origin
- [ ] Avatar upload/delete via Cloudinary

## Logs (Phase 11 A4)

After one login + one submit on the preview/prod URL, open Vercel → Project → Logs / Functions:

- [ ] No raw `DATABASE_URL` / connection strings
- [ ] No stack dumps of secrets
- [ ] No answer keys / marking schemes

Record date, URL host (not secrets), and result:

| Date | URL host | Result | Notes |
| --- | --- | --- | --- |
| | | PASS / FAIL / BLOCKED | |

## Production UI audit — Nov 27 2026

Production URL: https://comsats-webathone.vercel.app

- [ ] Sidebar icons are distinct per role (ShieldCheck for proctor exams, Award for student results, ChartNoAxesCombined for performance, Library for question bank, FileBarChart for staff results)
- [ ] StatCard icon badge has accessible contrast (bg-muted + text-muted-foreground)
- [ ] Empty states show icon + title + description in ExamsTable and ExamResultsView
- [ ] Error pages on private routes link to role dashboard ("Go to dashboard") not sign-in
- [ ] Student dashboard DashboardIntro shows Performance link to /student/reports
- [ ] Forgot-password link present on sign-in page
- [ ] not-found.tsx at app root renders correctly with StatusPanel
- [ ] SidebarTrigger and avatar DropdownMenuTrigger have aria-label
- [ ] Mobile: empty/error state text is readable inside ResponsiveTable scroll area
- [ ] All stat card values formatted with Intl.NumberFormat

| Date | URL host | Result | Notes |
| --- | --- | --- | --- |
| Nov 27 2026 | comsats-webathone.vercel.app | — | UI audit checklist added |

## Judge demo script (~12 minutes)

1. Sign in as **admin** — show dashboard, users, question bank.
2. Open **Exam Builder** — create/open a draft, import questions, show publish checklist, publish.
3. Confirm student + proctor assignments (seeded or assign now).
4. Sign in as **student** — start ongoing exam, answer 2–3 questions, refresh, submit (or show offline banner briefly).
5. Sign in as **proctor** — open monitor for assigned exam.
6. Sign in as **examiner/admin** — grade any long answer, publish results.
7. Student result view + optional PDF verify QR on `/verify/[reportId]`.
8. Mention failure resilience: server deadline, IndexedDB sync, no extra time offline.
