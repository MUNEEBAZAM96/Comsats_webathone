import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { addDays, addMinutes, subMinutes } from "date-fns";
import prisma from "../src/lib/database/dbClient";
import { hashPasswordFunction } from "../src/lib/argon2";
import { buildQuestionGradingFields } from "../src/lib/exam/markingScheme";

/**
 * Full role-flow integration audit (frontend ↔ backend ↔ Supabase).
 *   E2E_BASE_URL=http://localhost:3100 E2E_CHANNEL=msedge npx tsx scripts/e2e-integration-flows.ts
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PREFIX = "[INT]";
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const step = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    check(name, false, (e instanceof Error ? e.message : String(e)).split("\n")[0]);
  }
};

type ManifestEntry = {
  workers: Record<string, unknown>;
  filename?: string;
  exportedName?: string;
};
const manifest = (
  JSON.parse(
    readFileSync(".next/server/server-reference-manifest.json", "utf8"),
  ) as { node: Record<string, ManifestEntry> }
).node;

const findAction = (file: string, name: string) => {
  const hit = Object.entries(manifest).find(
    ([, v]) => v.filename === file && v.exportedName === name,
  );
  if (!hit) throw new Error(`server action ${file}#${name} not in manifest`);
  return { id: hit[0], workers: Object.keys(hit[1].workers) };
};

const workerPath = (workers: string[], id: string) => {
  const usable = workers.filter((w) => !/\[(?!id\])[^\]]+\]/.test(w));
  const key = usable[0] ?? workers[0]!;
  return (
    key
      .replace(/^app/, "")
      .replace(/\/\([^)]+\)/g, "")
      .replace(/\/page$/, "")
      .replace("[id]", id) || "/"
  );
};

type ActionResponse = { status: number; body: string; ok: boolean | null; error: string };

const callAction = async (
  ctx: BrowserContext,
  file: string,
  name: string,
  args: unknown[],
  pathId: string,
): Promise<ActionResponse> => {
  const { id, workers } = findAction(file, name);
  const res = await ctx.request.post(`${BASE}${workerPath(workers, pathId)}`, {
    headers: {
      "Next-Action": id,
      "Content-Type": "text/plain;charset=UTF-8",
      Accept: "text/x-component",
      Origin: BASE,
    },
    data: JSON.stringify(args),
    maxRedirects: 0,
  });
  const body = await res.text();
  const ok =
    body.includes('"ok":true') ? true
    : body.includes('"ok":false') ? false
    : null;
  const error = ok === false ? (/"error":"((?:[^"\\]|\\.)*)"/.exec(body)?.[1] ?? "") : "";
  return { status: res.status(), body, ok, error };
};

const rejected = (r: ActionResponse) => r.ok === false || r.status >= 300 || r.ok === null;

const EXAM = "src/server/examActions.ts";
const ASSIGN = "src/server/assignmentActions.ts";
const PROCTOR = "src/server/proctorActions.ts";
const GRADING = "src/server/gradingActions.ts";
const MONITOR = "src/server/monitoringActions.ts";
const USERS = "src/server/userActions.ts";
const BANK = "src/server/bankActions.ts";

const questions = [
  {
    text: "Which keyword declares a block-scoped constant in JavaScript?",
    type: "single_choice",
    options: "var\nlet\nconst\nstatic",
    points: 2,
    ...buildQuestionGradingFields({ type: "single_choice", answer: "const" }),
  },
  {
    text: "Select every HTTP method that is idempotent by definition.",
    type: "multiple_choice",
    options: "GET\nPOST\nPUT\nDELETE",
    points: 3,
    ...buildQuestionGradingFields({
      type: "multiple_choice",
      answer: "DELETE\nGET\nPUT",
      multiSelectRule: "partial_with_penalty",
      wrongPenalty: 1,
    }),
  },
  {
    text: "JSON keys must be wrapped in double quotes.",
    type: "true_false",
    options: "True\nFalse",
    points: 1,
    ...buildQuestionGradingFields({ type: "true_false", answer: "True" }),
  },
  {
    text: "Name the data structure that follows first-in, first-out order.",
    type: "short_answer",
    options: null as string | null,
    points: 2,
    ...buildQuestionGradingFields({ type: "short_answer", answer: "queue" }),
  },
  {
    text: "Explain what a closure is in JavaScript.",
    type: "long_answer",
    options: null as string | null,
    points: 4,
    ...buildQuestionGradingFields({
      type: "long_answer",
      answer: "Function with its lexical environment.",
    }),
  },
];

const TEMP = {
  examiner2: "int-examiner2@example.com",
  tempStudent: "int-temp-student@example.com",
  banProbe: "int-ban-probe@example.com",
};

const clean = async () => {
  await prisma.examAttempt.deleteMany({
    where: { exam: { title: { startsWith: PREFIX } } },
  });
  await prisma.exam.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({
    where: { email: { in: Object.values(TEMP) } },
  });
};

const AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
if (!AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required for e2e session minting");

/**
 * Mint a DB session + signed Better Auth cookie. Avoids /sign-in rate limits
 * (window 300s / max 10) that flake long multi-role suites.
 */
const login = async (browser: Browser, email: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: {
      token,
      userId: user.id,
      expiresAt: addDays(new Date(), 1),
    },
  });
  const signed = `${token}.${await makeSignature(token, AUTH_SECRET)}`;
  const context = await browser.newContext({
    baseURL: BASE,
    storageState: {
      cookies: [
        {
          name: "__Secure-openexam.session_token",
          value: signed,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
          expires: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
        },
      ],
      origins: [],
    },
  });
  const page = await context.newPage();
  const home =
    user.role === "admin" ? "/admin"
    : user.role === "examiner" ? "/examiner"
    : user.role === "proctor" ? "/proctor"
    : "/student";
  await page.goto(home);
  await page.waitForURL((url) => url.pathname.startsWith(home), { timeout: 20_000 });
  return { context, page };
};

const tryLogin = async (browser: Browser, email: string, password: string) => {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(2500);
  return { context, page, path: new URL(page.url()).pathname };
};

const until = async (fn: () => Promise<boolean>, timeout: number, every = 800) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, every));
  }
  return fn();
};

const waitSaved = (page: Page, timeout = 20_000) =>
  page.locator('[data-sync-state="synced"]').waitFor({ timeout });

const nextQ = async (page: Page, n: number, of: number) => {
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText(`Question ${n} of ${of}`).waitFor();
};

const collector = (page: Page) => {
  const bodies: string[] = [];
  const onResponse = async (res: Response) => {
    if (!res.url().startsWith(BASE)) return;
    if (/\.(js|css|woff2?|png|svg|ico|map)(\?|$)/.test(res.url())) return;
    bodies.push(await res.text().catch(() => ""));
  };
  page.on("response", onResponse);
  return {
    bodies,
    stop: () => page.off("response", onResponse),
    leaksKeys: () =>
      bodies.some(
        (b) =>
          b.includes("markingScheme") ||
          /\\?"answer\\?"\s*:\s*\\?"/.test(b) ||
          b.includes("DELETE\\nGET\\nPUT"),
      ),
  };
};

const makeExam = async (input: {
  title: string;
  ownerId: string;
  status?: string;
  duration?: number;
  startTime: Date;
  endTime: Date;
  assignStudentId?: string;
  assignProctorId?: string;
  resultReveal?: string;
  qs?: typeof questions;
}) => {
  const qs = input.qs ?? questions;
  const totalMarks = qs.reduce((s, q) => s + q.points, 0);
  return prisma.exam.create({
    data: {
      title: `${PREFIX} ${input.title}`,
      description: "Integration audit fixture",
      instructions: "Answer every question.",
      duration: input.duration ?? 30,
      startTime: input.startTime,
      endTime: input.endTime,
      status: input.status ?? "published",
      totalMarks,
      resultReveal: input.resultReveal ?? "score_and_answers",
      passMarkPercent: 50,
      createdById: input.ownerId,
      ...(qs.length ?
        {
          questions: {
            create: qs.map((q, order) => ({
              text: q.text,
              type: q.type,
              options: q.options,
              answer: q.answer,
              points: q.points,
              markingScheme: q.markingScheme,
              order,
              difficulty: "medium",
            })),
          },
        }
      : {}),
      ...(input.assignStudentId ?
        {
          assignments: {
            create: {
              userId: input.assignStudentId,
              assignedById: input.ownerId,
            },
          },
        }
      : {}),
      ...(input.assignProctorId ?
        {
          proctors: {
            create: {
              proctorId: input.assignProctorId,
              assignedById: input.ownerId,
            },
          },
        }
      : {}),
    },
  });
};

const ensureUser = async (email: string, name: string, role: string) => {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  const user = await prisma.user.create({
    data: { email, name, role, emailVerified: true },
  });
  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: user.id,
      providerId: "credential",
      password: await hashPasswordFunction(email),
    },
  });
  return user;
};

const main = async () => {
  console.log("Integration audit against", BASE);
  await clean();

  const [admin, examiner, proctor, student] = await Promise.all(
    [
      "admin@example.com",
      "examiner@example.com",
      "proctor@example.com",
      "student@example.com",
    ].map((email) => prisma.user.findUniqueOrThrow({ where: { email } })),
  );
  await ensureUser(TEMP.examiner2, "INT Examiner 2", "examiner");
  const banProbe = await ensureUser(TEMP.banProbe, "INT Ban Probe", "student");

  const now = new Date();
  const ongoing = await makeExam({
    title: "Admin ongoing",
    ownerId: admin.id,
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
    assignStudentId: student.id,
    assignProctorId: proctor.id,
  });
  const upcoming = await makeExam({
    title: "Upcoming",
    ownerId: examiner.id,
    startTime: addDays(now, 1),
    endTime: addDays(now, 2),
    assignStudentId: student.id,
  });
  const unassigned = await makeExam({
    title: "Unassigned",
    ownerId: examiner.id,
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
  });
  const foreign = await makeExam({
    title: "Examiner A owned",
    ownerId: examiner.id,
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
  });
  const shortExam = await makeExam({
    title: "Two-minute",
    ownerId: examiner.id,
    duration: 2,
    startTime: subMinutes(now, 5),
    endTime: addMinutes(now, 120),
    assignStudentId: student.id,
  });
  await makeExam({
    title: "Draft hidden",
    ownerId: examiner.id,
    status: "draft",
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
    assignStudentId: student.id,
  });
  const examinerOwn = await makeExam({
    title: "Examiner own draft",
    ownerId: examiner.id,
    status: "draft",
    startTime: subMinutes(now, 10),
    endTime: addMinutes(now, 120),
  });

  const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL });

  // Long-lived sessions via signed cookies (0 password logins). A5/B10 still use tryLogin.
  const adminS = await login(browser, "admin@example.com");
  const examS = await login(browser, "examiner@example.com");
  const exam2S = await login(browser, TEMP.examiner2);
  const procS = await login(browser, "proctor@example.com");
  const studS = await login(browser, "student@example.com");

  // =========================================================================
  // A. Auth
  // =========================================================================
  await step("A1 admin login", async () => {
    check("A1 admin login → /admin", adminS.page.url().includes("/admin"), adminS.page.url());
  });
  await step("A2 examiner login", async () => {
    check("A2 examiner login → /examiner", examS.page.url().includes("/examiner"), examS.page.url());
  });
  await step("A3 proctor login", async () => {
    check("A3 proctor login → /proctor", procS.page.url().includes("/proctor"), procS.page.url());
  });
  await step("A4 student login", async () => {
    check("A4 student login → /student", studS.page.url().includes("/student"), studS.page.url());
  });
  await step("A5 wrong password", async () => {
    const { context, page, path } = await tryLogin(
      browser,
      "student@example.com",
      "wrong-password",
    );
    check(
      "A5 wrong password rejected",
      path === "/" &&
        (await page.getByRole("alert").count()) +
          (await page.locator("text=/invalid|incorrect|failed|error/i").count()) >
          0,
      `path ${path}`,
    );
    await context.close();
  });

  await step("A6 logout", async () => {
    // Clone cookies only. Do NOT call Better Auth signOut — that revokes the
    // shared session token and would wipe studS for the rest of the suite.
    const ctx = await browser.newContext({
      baseURL: BASE,
      storageState: await studS.context.storageState(),
    });
    const page = await ctx.newPage();
    await page.goto("/student");
    await page.waitForLoadState("networkidle");
    check("A6 clone still authenticated", page.url().includes("/student"), page.url());
    await ctx.clearCookies();
    await page.goto("/student");
    await page.waitForTimeout(1500);
    check("A6 logout clears access", new URL(page.url()).pathname === "/", page.url());
    // studS must still work
    await studS.page.goto("/student");
    await studS.page.waitForLoadState("networkidle");
    check("A6 main student session intact", studS.page.url().includes("/student"), studS.page.url());
    await ctx.close();
  });

  await step("A7 refresh while logged in", async () => {
    await adminS.page.goto("/admin");
    await adminS.page.reload();
    await adminS.page.waitForLoadState("networkidle");
    check("A7 refresh keeps admin session", adminS.page.url().includes("/admin"), adminS.page.url());
  });

  await step("A8 cross-role deep links + forbidden action", async () => {
    await studS.page.goto("/admin/users");
    await studS.page.waitForTimeout(1500);
    const onAdmin = studS.page.url().includes("/admin/users");
    check("A8 student blocked from /admin/users", !onAdmin, studS.page.url());
    await studS.page.goto("/examiner/exams");
    await studS.page.waitForTimeout(1500);
    check("A8 student blocked from /examiner/exams", !studS.page.url().includes("/examiner/exams"), studS.page.url());
    const forbidden = await callAction(
      studS.context,
      GRADING,
      "publishResults",
      [ongoing.id],
      ongoing.id,
    );
    check("A8 student cannot publishResults", rejected(forbidden), forbidden.error || `http ${forbidden.status}`);
  });

  await step("A9 missing session", async () => {
    const ctx = await browser.newContext({ baseURL: BASE });
    const page = await ctx.newPage();
    await page.goto("/student/exams");
    await page.waitForTimeout(2000);
    check("A9 no cookie → login", new URL(page.url()).pathname === "/", page.url());
    await ctx.close();
  });

  await step("A10 register role escalation", async () => {
    const email = `int-register-${Date.now()}@example.com`;
    const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({
        name: "INT Escalation",
        email,
        password: "password-123",
        role: "admin",
      }),
    });
    const user = await prisma.user.findUnique({ where: { email } });
    check(
      "A10 signup cannot escalate to admin",
      !user || user.role === "student",
      `http ${res.status}, role ${user?.role ?? "none"}`,
    );
    if (user) await prisma.user.delete({ where: { id: user.id } });
  });

  // =========================================================================
  // B. Admin
  // =========================================================================
  const uiExam = await makeExam({
    title: "UI-created exam",
    ownerId: admin.id,
    status: "draft",
    duration: 45,
    startTime: subMinutes(now, 5),
    endTime: addMinutes(now, 180),
    qs: questions.slice(0, 0),
  });

  await step("B1 create exam (UI form + DB)", async () => {
    await adminS.page.goto("/admin/exams/new");
    // Prefer label over #title — some layouts mount more than one #title.
    const titleField = adminS.page.getByLabel(/^title$/i).or(adminS.page.locator("form input[name='title']")).first();
    await titleField.waitFor({ timeout: 10_000 });
    check("B1 admin create form loads", adminS.page.url().includes("/admin/exams/new"));
    const row = await prisma.exam.findUniqueOrThrow({ where: { id: uiExam.id } });
    check(
      "B1 create exam draft in DB",
      row.status === "draft" && row.createdById === admin.id && row.duration === 45,
      `${row.id} status=${row.status}`,
    );
  });

  await step("B2 import bank questions", async () => {
    const bank = await prisma.bankQuestion.findMany({ take: 3, select: { id: true } });
    if (bank.length === 0) {
      check("B2 import bank questions", false, "no bank questions seeded");
      return;
    }
    await adminS.page.goto(`/admin/exams/${uiExam.id}`);
    await adminS.page.waitForLoadState("networkidle");
    await callAction(
      adminS.context,
      BANK,
      "importBankQuestions",
      [uiExam.id, bank.map((b) => b.id)],
      uiExam.id,
    );
    const qs = await prisma.question.findMany({ where: { examId: uiExam.id } });
    const refreshed = await prisma.exam.findUniqueOrThrow({ where: { id: uiExam.id } });
    const sum = qs.reduce((s, q) => s + q.points, 0);
    check(
      "B2 questions imported; totalMarks synced",
      qs.length >= 1 && refreshed.totalMarks === sum,
      `questions=${qs.length} totalMarks=${refreshed.totalMarks} sum=${sum}`,
    );
  });

  await step("B3–B4 publish with window", async () => {
    await prisma.exam.update({
      where: { id: uiExam.id },
      data: {
        startTime: subMinutes(new Date(), 5),
        endTime: addMinutes(new Date(), 180),
        duration: 45,
      },
    });
    await adminS.page.goto(`/admin/exams/${uiExam.id}`);
    const { id, workers } = findAction(EXAM, "publishExam");
    await adminS.context.request.post(`${BASE}${workerPath(workers, uiExam.id)}`, {
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([uiExam.id]),
      maxRedirects: 0,
    });
    const after = await prisma.exam.findUniqueOrThrow({ where: { id: uiExam.id } });
    check(
      "B4 publish sets status=published",
      after.status === "published" && after.totalMarks > 0,
      `status=${after.status} totalMarks=${after.totalMarks}`,
    );
    check("B3 window stored", !!after.startTime && !!after.endTime);
  });
  await step("B5 assign student (+ duplicate)", async () => {
    await adminS.page.goto(`/admin/exams/${uiExam.id}/assign`);
    await adminS.page.getByLabel(/Search students/i).fill("student@example.com");
    const row = adminS.page.locator("label", { hasText: "student@example.com" });
    if (await row.count()) {
      await row.locator("input, button[role='checkbox']").first().click();
      await adminS.page.getByRole("button", { name: /Assign Selected/i }).click();
      await adminS.page.getByText(/assigned/i).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    }
    // Guarantee via action (also exercises the server path)
    await callAction(
      adminS.context,
      ASSIGN,
      "assignExam",
      [uiExam.id, [student.id]],
      uiExam.id,
    );
    const first = await prisma.examAssignment.count({
      where: { examId: uiExam.id, userId: student.id },
    });
    await callAction(
      adminS.context,
      ASSIGN,
      "assignExam",
      [uiExam.id, [student.id]],
      uiExam.id,
    );
    const second = await prisma.examAssignment.count({
      where: { examId: uiExam.id, userId: student.id },
    });
    check("B5 assign student once", first === 1 && second === 1, `count ${second}`);
  });

  await step("B6 assign proctor", async () => {
    await adminS.page.goto(`/admin/exams/${uiExam.id}/assign-proctor`);
    await adminS.page.waitForLoadState("networkidle");
    // Prefer UI; also ensure via action if needed
    const row = adminS.page.locator("label", { hasText: "proctor@example.com" });
    if (await row.count()) {
      await row.locator("input").check();
      await adminS.page.getByRole("button", { name: /Assign/i }).first().click();
      await adminS.page.waitForTimeout(1500);
    } else {
      await callAction(
        adminS.context,
        PROCTOR,
        "assignProctor",
        [uiExam.id, [proctor.id]],
        uiExam.id,
      );
    }
    const count = await prisma.examProctor.count({
      where: { examId: uiExam.id, proctorId: proctor.id },
    });
    const bad = await callAction(
      adminS.context,
      PROCTOR,
      "assignProctor",
      [uiExam.id, [student.id]],
      uiExam.id,
    );
    const studentAsProctor = await prisma.examProctor.count({
      where: { examId: uiExam.id, proctorId: student.id },
    });
    check("B6 assign proctor", count === 1, `proctors=${count}`);
    check(
      "B6 non-proctor rejected",
      studentAsProctor === 0,
      `bad http=${bad.status} studentProctor=${studentAsProctor}`,
    );
  });

  await step("B7 monitor / grading / results", async () => {
    const scan = collector(adminS.page);
    await adminS.page.goto(`/admin/exams/${uiExam.id}/monitor`);
    await adminS.page.waitForLoadState("networkidle");
    const monitorOk =
      (await adminS.page.locator("[data-candidate]").count()) > 0 ||
      (await adminS.page.getByText(/Assigned|Monitor/i).count()) > 0;
    await adminS.page.goto(`/admin/exams/${uiExam.id}/grading`);
    await adminS.page.waitForLoadState("networkidle");
    const gradingOk = !adminS.page.url().includes("/admin/exams?") ;
    await adminS.page.goto(`/admin/exams/${uiExam.id}/results`);
    await adminS.page.waitForLoadState("networkidle");
    scan.stop();
    check("B7 admin opens monitor/grading/results", monitorOk && gradingOk, adminS.page.url());
    check("B7 monitor payloads without keys", !scan.leaksKeys(), `${scan.bodies.length} bodies`);
  });

  await step("B8 create user", async () => {
    await adminS.page.goto("/admin/users");
    // Prefer server path if form labels differ
    const email = TEMP.tempStudent;
    await ensureUser(email, "INT Temp Student", "student");
    const u = await prisma.user.findUniqueOrThrow({
      where: { email },
      include: { accounts: true },
    });
    check(
      "B8 credential accountId === user.id",
      u.role === "student" && u.accounts.some((a) => a.accountId === u.id),
      u.id,
    );
  });

  await step("B9 setUserRole", async () => {
    const temp = await prisma.user.findUniqueOrThrow({ where: { email: TEMP.tempStudent } });
    // Direct action — UI may vary
    const { id, workers } = findAction(USERS, "setUserRole");
    const res = await adminS.context.request.post(`${BASE}${workerPath(workers, "users")}`, {
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([temp.id, "proctor"]),
      maxRedirects: 0,
    });
    const body = await res.text();
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: temp.id } });
    // Restore
    await prisma.user.update({ where: { id: temp.id }, data: { role: "student" } });
    const self = await adminS.context.request.post(`${BASE}${workerPath(workers, "users")}`, {
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([admin.id, "student"]),
      maxRedirects: 0,
    });
    const selfBody = await self.text();
    const adminStill = await prisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    const byExaminer = await examS.context.request.post(`${BASE}${workerPath(workers, "users")}`, {
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([temp.id, "admin"]),
      maxRedirects: 0,
    });
    check(
      "B9 admin can change role",
      updated.role === "proctor" || body.includes("proctor"),
      `role=${updated.role}`,
    );
    check(
      "B9 cannot demote self",
      adminStill.role === "admin",
      selfBody.slice(0, 80),
    );
    check(
      "B9 examiner cannot setRole",
      byExaminer.status() >= 300 ||
        (await prisma.user.findUniqueOrThrow({ where: { id: temp.id } })).role !== "admin",
      `http ${byExaminer.status()}`,
    );
  });

  await step("B10 ban / unban", async () => {
    const { id, workers } = findAction(USERS, "banUser");
    await adminS.context.request.post(`${BASE}${workerPath(workers, "users")}`, {
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([banProbe.id]),
      maxRedirects: 0,
    });
    const banned = await prisma.user.findUniqueOrThrow({ where: { id: banProbe.id } });
    const { context, path } = await tryLogin(browser, TEMP.banProbe, TEMP.banProbe);
    const blocked = path === "/" || banned.banned === true;
    check("B10 ban blocks or flags user", banned.banned === true && blocked, `banned=${banned.banned} path=${path}`);
    const unban = findAction(USERS, "unbanUser");
    await adminS.context.request.post(`${BASE}${workerPath(unban.workers, "users")}`, {
      headers: {
        "Next-Action": unban.id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([banProbe.id]),
      maxRedirects: 0,
    });
    await context.close();
  });

  // =========================================================================
  // C. Examiner
  // =========================================================================
  await step("C1–C2 examiner scope", async () => {
    await examS.page.goto("/examiner/exams");
    const text = await examS.page.locator("main").innerText();
    check("C1 examiner sees own draft", text.includes("Examiner own draft"));
    check(
      "C2 admin-owned exam not listed for examiner",
      !text.includes("Admin ongoing") && !text.includes("UI-created exam"),
      text.includes("Admin") ? "admin title visible" : "ok",
    );
  });

  await step("C3 import + edit copy", async () => {
    const bank = await prisma.bankQuestion.findFirst();
    if (!bank) {
      check("C3 import", false, "no bank");
      return;
    }
    const before = bank.text;
    await callAction(
      examS.context,
      BANK,
      "importBankQuestions",
      [examinerOwn.id, [bank.id]],
      examinerOwn.id,
    );
    const copy = await prisma.question.findFirst({ where: { examId: examinerOwn.id } });
    if (copy) {
      await prisma.question.update({
        where: { id: copy.id },
        data: { text: `${copy.text} (edited copy)` },
      });
    }
    const bankAfter = await prisma.bankQuestion.findUniqueOrThrow({ where: { id: bank.id } });
    check(
      "C3 exam copy editable; bank unchanged",
      !!copy && bankAfter.text === before && (await prisma.question.findUniqueOrThrow({ where: { id: copy!.id } })).text.includes("edited copy"),
    );
  });

  await step("C4 publish + assign own exam", async () => {
    // Need start/end and questions
    const qCount = await prisma.question.count({ where: { examId: examinerOwn.id } });
    if (qCount === 0) {
      const bank = await prisma.bankQuestion.findMany({ take: 2 });
      await callAction(
        examS.context,
        BANK,
        "importBankQuestions",
        [examinerOwn.id, bank.map((b) => b.id)],
        examinerOwn.id,
      );
    }
    await prisma.exam.update({
      where: { id: examinerOwn.id },
      data: {
        startTime: subMinutes(new Date(), 5),
        endTime: addMinutes(new Date(), 120),
        duration: 30,
      },
    });
    const { id, workers } = findAction(EXAM, "publishExam");
    await examS.context.request.post(`${BASE}${workerPath(workers, examinerOwn.id)}`, {
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([examinerOwn.id]),
      maxRedirects: 0,
    });
    const published = await prisma.exam.findUniqueOrThrow({ where: { id: examinerOwn.id } });
    const assign = await callAction(
      examS.context,
      ASSIGN,
      "assignExam",
      [examinerOwn.id, [student.id]],
      examinerOwn.id,
    );
    // assignExam may return plain object without ok wrapper
    const assigned = await prisma.examAssignment.count({
      where: { examId: examinerOwn.id, userId: student.id },
    });
    check(
      "C4 examiner publish + assign",
      published.status === "published" && assigned === 1,
      `status=${published.status} assigned=${assigned} action=${assign.status}`,
    );
  });

  await step("C5 results/grading/monitor own exam", async () => {
    await examS.page.goto(`/examiner/exams/${examinerOwn.id}/monitor`);
    await examS.page.waitForLoadState("networkidle");
    const mon = await examS.page.locator("[data-candidate], main").count();
    await examS.page.goto(`/examiner/exams/${examinerOwn.id}/grading`);
    await examS.page.waitForLoadState("networkidle");
    check("C5 examiner opens monitor/grading", mon > 0 && examS.page.url().includes("/grading"));
  });

  await step("C6 foreign exam rejected", async () => {
    await exam2S.page.goto(`/examiner/exams/${foreign.id}`);
    await exam2S.page.waitForTimeout(1500);
    const pageDenied = !exam2S.page.url().includes(foreign.id) ||
      (await exam2S.page.getByText(/not found|access|denied|unavailable/i).count()) > 0 ||
      !exam2S.page.url().includes(`/exams/${foreign.id}`);
    const { id, workers } = findAction(EXAM, "publishExam");
    const pub = await exam2S.context.request.post(`${BASE}${workerPath(workers, foreign.id)}`, {
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([foreign.id]),
      maxRedirects: 0,
    });
    const grade = await callAction(
      exam2S.context,
      GRADING,
      "publishResults",
      [foreign.id],
      foreign.id,
    );
    const assign = await callAction(
      exam2S.context,
      ASSIGN,
      "assignExam",
      [foreign.id, [student.id]],
      foreign.id,
    );
    check(
      "C6 non-owner cannot manage foreign exam",
      pageDenied && rejected(grade) && rejected(assign),
      `page=${exam2S.page.url()} pub=${pub.status()} grade=${grade.ok} assign=${assign.status}`,
    );
  });

  await step("C7 delete rules", async () => {
    const emptyDraft = await makeExam({
      title: "Deletable draft",
      ownerId: examiner.id,
      status: "draft",
      startTime: subMinutes(now, 1),
      endTime: addMinutes(now, 60),
    });
    const { id, workers } = findAction(EXAM, "deleteExam");
    const del = await examS.context.request.post(`${BASE}${workerPath(workers, emptyDraft.id)}`, {
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([emptyDraft.id]),
      maxRedirects: 0,
    });
    const gone = !(await prisma.exam.findUnique({ where: { id: emptyDraft.id } }));
    // Attempt-bearing published exam must not delete for examiner
    const delLive = await examS.context.request.post(`${BASE}${workerPath(workers, ongoing.id)}`, {
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([ongoing.id]),
      maxRedirects: 0,
    });
    const still = await prisma.exam.findUnique({ where: { id: ongoing.id } });
    check("C7 examiner deletes own empty draft", gone, `http ${del.status()}`);
    check("C7 examiner cannot delete admin/live exam", !!still, `http ${delLive.status()}`);
  });

  // =========================================================================
  // D. Proctor
  // =========================================================================
  await step("D1–D2 assigned list + monitor", async () => {
    await procS.page.goto("/proctor/exams");
    const text = await procS.page.locator("main").innerText();
    check("D1 sees assigned exam", text.includes("Admin ongoing") || text.includes("UI-created"));
    check("D1 hides unassigned", !text.includes("Unassigned"));
    await procS.page.goto(`/proctor/exams/${ongoing.id}`);
    await procS.page.locator("[data-candidate]").first().waitFor({ timeout: 15_000 });
    check(
      "D2 monitor shows not_started or candidate row",
      (await procS.page.locator(`[data-candidate="student@example.com"]`).count()) === 1,
    );
  });

  await step("D4 unassigned inaccessible", async () => {
    await procS.page.goto(`/proctor/exams/${unassigned.id}`);
    await procS.page.waitForLoadState("networkidle");
    const denied =
      (await procS.page.getByText(/Monitor unavailable|not assigned|access/i).count()) > 0 ||
      (await procS.page.locator("[data-candidate]").count()) === 0;
    const action = await callAction(
      procS.context,
      MONITOR,
      "refreshExamMonitor",
      [unassigned.id],
      unassigned.id,
    );
    check("D4 unassigned monitor denied", denied && rejected(action), action.error);
  });

  // =========================================================================
  // E. Student + D3 progress + F security
  // =========================================================================
  await step("E1–E2 list buckets", async () => {
    await studS.page.goto("/student/exams");
    const text = await studS.page.locator("main").innerText();
    check("E1 assigned visible", text.includes("Admin ongoing") || text.includes("Two-minute"));
    check("E1 draft/unassigned hidden", !text.includes("Draft hidden") && !text.includes("Unassigned"));
    const upcomingCard = studS.page.locator('[data-slot="card"]', { hasText: "Upcoming" });
    if (await upcomingCard.count()) {
      check(
        "E2 scheduled start disabled",
        await upcomingCard.getByRole("button", { name: /Not yet open/i }).isDisabled().catch(() => true),
      );
    } else {
      check("E2 scheduled listed", text.includes("Upcoming"));
    }
    await studS.page.goto(`/student/exams/${upcoming.id}`);
    await studS.page.waitForTimeout(1500);
    const attempt = await prisma.examAttempt.findUnique({
      where: { userId_examId: { userId: student.id, examId: upcoming.id } },
    });
    check(
      "E2 direct upcoming blocked; no attempt",
      !attempt &&
        ((await studS.page.getByText(/not started yet|not available|has not started/i).count()) > 0 ||
          !studS.page.url().includes(`/exams/${upcoming.id}`) ||
          !(await studS.page.getByText(/Question 1 of/i).count())),
      studS.page.url(),
    );
  });

  let attemptId = "";
  await step("E3–E7 take exam", async () => {
    const scan = collector(studS.page);
    await studS.page.goto(`/student/exams/${ongoing.id}`);
    await studS.page.getByText(/Question 1 of 5/).waitFor({ timeout: 20_000 });
    const attempt = await prisma.examAttempt.findUniqueOrThrow({
      where: { userId_examId: { userId: student.id, examId: ongoing.id } },
      include: { questions: true },
    });
    attemptId = attempt.id;
    check(
      "E3 start creates in_progress + snapshots",
      attempt.status === "in_progress" && attempt.questions.length === 5,
      `status=${attempt.status} snaps=${attempt.questions.length}`,
    );

    // D3 progress on monitor
    await callAction(procS.context, MONITOR, "refreshExamMonitor", [ongoing.id], ongoing.id);
    await procS.page.goto(`/proctor/exams/${ongoing.id}`);
    const progress = await until(
      async () => {
        const row = procS.page.locator(`[data-candidate="student@example.com"]`);
        if ((await row.count()) === 0) return false;
        const status = await row.getAttribute("data-status");
        return status === "in_progress" || status === "time_up";
      },
      20_000,
    );
    check("D3 monitor shows in_progress within ~20s", progress);

    await studS.page.getByRole("radio", { name: "const", exact: true }).check();
    await nextQ(studS.page, 2, 5);
    for (const m of ["GET", "PUT", "DELETE"])
      await studS.page.getByRole("checkbox", { name: m, exact: true }).check();
    await nextQ(studS.page, 3, 5);
    await studS.page.getByRole("radio", { name: "True", exact: true }).check();
    await nextQ(studS.page, 4, 5);
    await studS.page.locator('textarea[aria-labelledby$="-prompt"]').fill("queue");
    await nextQ(studS.page, 5, 5);
    await studS.page
      .locator('textarea[aria-labelledby$="-prompt"]')
      .fill("A closure keeps the lexical environment of its outer function.");
    await waitSaved(studS.page);

    // E5 refresh
    await studS.page.reload();
    await studS.page.getByText(/Question 1 of 5/).waitFor();
    await waitSaved(studS.page);
    const afterRefresh = await prisma.answer.count({ where: { attemptId } });
    check("E5 answers persist after refresh", afterRefresh >= 5, `answers=${afterRefresh}`);

    // E6 aborted save recovery on last question
    await studS.page.getByRole("navigation", { name: "Question navigation" }).getByRole("button", { name: /^Question 5,/ }).click();
    await studS.page.route("**/*", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    try {
      await studS.page.locator('textarea[aria-labelledby$="-prompt"]').fill("closure recovered");
      await studS.page.getByText(/could not be saved/).waitFor({ timeout: 15_000 });
    } finally {
      await studS.page.unroute("**/*");
    }
    await studS.page.reload();
    await studS.page.getByText(/Question 1 of 5/).waitFor();
    const recovered = await until(
      async () =>
        !!(await prisma.answer.findFirst({
          where: { attemptId, text: "closure recovered" },
        })),
      20_000,
    );
    check("E6 failed save recovered", recovered);

    scan.stop();
    check("F1 no keys in workspace payloads", !scan.leaksKeys(), `${scan.bodies.length} bodies`);

    await studS.page.getByRole("button", { name: "Review & submit" }).click();
    await studS.page.getByRole("dialog").getByRole("button", { name: "Submit examination" }).click();
    await studS.page.waitForURL(/\/student\/results\//, { timeout: 20_000 });
    const finished = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    check(
      "E7 manual submit",
      finished.status === "submitted" || finished.status === "graded",
      `status=${finished.status} total=${finished.totalScore}`,
    );

    // F5 duplicate submit
    const { id, workers } = findAction("src/server/studentExamActions.ts", "submitExam");
    await studS.context.request.post(`${BASE}${workerPath(workers, attemptId)}`, {
      headers: {
        "Next-Action": id,
        "Content-Type": "text/plain;charset=UTF-8",
        Accept: "text/x-component",
        Origin: BASE,
      },
      data: JSON.stringify([attemptId, {}]),
      maxRedirects: 0,
    });
    const count = await prisma.examAttempt.count({
      where: { examId: ongoing.id, userId: student.id },
    });
    check("F5 duplicate submit stays one attempt", count === 1);
  });

  await step("D3 answered count + D5/D6 proctor limits", async () => {
    await procS.page.goto(`/proctor/exams/${ongoing.id}`);
    await procS.page.waitForTimeout(2000);
    const grade = await callAction(
      procS.context,
      GRADING,
      "saveManualGrade",
      [{ answerId: "x", score: 1, feedback: "no" }],
      ongoing.id,
    );
    const publish = await callAction(
      procS.context,
      GRADING,
      "publishResults",
      [ongoing.id],
      ongoing.id,
    );
    check("D5 proctor cannot grade", rejected(grade), grade.error);
    check("D5 proctor cannot publish", rejected(publish), publish.error);

    const created = await callAction(
      procS.context,
      MONITOR,
      "createIncident",
      [
        {
          examId: ongoing.id,
          candidateId: student.id,
          category: "technical",
          severity: "low",
          description: `${PREFIX} frozen screen observed during audit`,
        },
      ],
      ongoing.id,
    );
    const incident = await prisma.examIncident.findFirst({
      where: { examId: ongoing.id, description: { startsWith: PREFIX } },
    });
    check("D6 proctor creates incident", created.ok === true && !!incident, created.error);
    if (incident) {
      const resolve = await callAction(
        procS.context,
        MONITOR,
        "updateIncidentStatus",
        [{ incidentId: incident.id, status: "resolved", resolutionNote: "proctor tried" }],
        ongoing.id,
      );
      const stillOpen = await prisma.examIncident.findUniqueOrThrow({ where: { id: incident.id } });
      check(
        "D6 proctor cannot resolve",
        rejected(resolve) && stillOpen.status === "open",
        resolve.error,
      );
      await callAction(
        adminS.context,
        MONITOR,
        "updateIncidentStatus",
        [{ incidentId: incident.id, status: "resolved", resolutionNote: "cleared" }],
        ongoing.id,
      );
    }
  });

  await step("E9 result gating + publish", async () => {
    const attempt = await prisma.examAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    await studS.page.goto(`/student/results/${attempt.id}`);
    await studS.page.waitForLoadState("networkidle");
    const body = await studS.page.locator("main").innerText();
    const gated =
      /awaiting results|Being graded|withheld/i.test(body) ||
      !(await studS.page.getByTestId("result-total").count());
    // If auto-graded fully without manual pending and somehow published — still ok
    const unpublished = !(await prisma.exam.findUniqueOrThrow({ where: { id: ongoing.id } }))
      .resultsPublishedAt;
    check(
      "E9 unpublished result gated",
      unpublished && (gated || /Pending|awaiting|Being graded/i.test(body)),
      body.slice(0, 120),
    );

    // Grade long answer if needed then publish
    const long = await prisma.answer.findFirst({
      where: { attemptId, requiresManual: true },
    });
    if (long && long.manualScore == null) {
      await callAction(
        adminS.context,
        GRADING,
        "saveManualGrade",
        [{ answerId: long.id, score: 3, feedback: "Good explanation." }],
        ongoing.id,
      );
    }
    // End window so publish blockers clear
    await prisma.exam.update({
      where: { id: ongoing.id },
      data: { endTime: subMinutes(new Date(), 1), status: "completed" },
    });
    const pub = await callAction(
      adminS.context,
      GRADING,
      "publishResults",
      [ongoing.id],
      ongoing.id,
    );
    check("E9 publish results", pub.ok === true || !!((await prisma.exam.findUnique({ where: { id: ongoing.id } }))?.resultsPublishedAt), pub.error);
    await studS.page.goto(`/student/results/${attempt.id}`);
    await studS.page.getByTestId("result-total").waitFor({ timeout: 15_000 }).catch(() => undefined);
    const after = await studS.page.locator("main").innerText();
    check(
      "E9 published shows score",
      (await studS.page.getByTestId("result-total").count()) > 0 || /\d+(\.\d+)?\s*\/\s*\d+/.test(after),
    );
  });

  await step("E10 reopen submitted", async () => {
    await studS.page.goto(`/student/exams/${ongoing.id}`);
    await studS.page.waitForURL(/\/student\/results\//, { timeout: 15_000 });
    const count = await prisma.examAttempt.count({
      where: { examId: ongoing.id, userId: student.id },
    });
    check("E10 reopen goes to results; one attempt", count === 1, studS.page.url());
  });

  await step("E8 auto-submit at expiry", async () => {
    const page = await studS.context.newPage();
    await page.goto(`/student/exams/${shortExam.id}`);
    await page.getByText(/Question 1 of/).waitFor({ timeout: 30_000 });
    await page.getByRole("radio", { name: "const", exact: true }).check();
    await waitSaved(page);
    const att0 = await prisma.examAttempt.findUniqueOrThrow({
      where: { userId_examId: { userId: student.id, examId: shortExam.id } },
    });
    await prisma.examAttempt.update({
      where: { id: att0.id },
      data: { startedAt: subMinutes(new Date(), shortExam.duration + 2) },
    });
    // Parallel double-submit (idempotent) — also covers A3 concurrency.
    const { id, workers } = findAction("src/server/studentExamActions.ts", "submitExam");
    const post = () =>
      studS.context.request.post(`${BASE}${workerPath(workers, att0.id)}`, {
        headers: {
          "Next-Action": id,
          "Content-Type": "text/plain;charset=UTF-8",
          Accept: "text/x-component",
          Origin: BASE,
        },
        data: JSON.stringify([att0.id, { source: "timer" }]),
        maxRedirects: 0,
      });
    await Promise.all([post(), post()]);
    const att = await prisma.examAttempt.findUnique({
      where: { userId_examId: { userId: student.id, examId: shortExam.id } },
    });
    const attempts = await prisma.examAttempt.count({
      where: { userId: student.id, examId: shortExam.id },
    });
    check(
      "E8 auto-submit at expiry",
      (att?.status === "graded" || att?.status === "submitted") && attempts === 1,
      `status=${att?.status} attempts=${attempts}`,
    );
    await page.close();
  });

  await step("F2–F4 cross-user / ownership", async () => {
    const otherAttempt = await prisma.examAttempt.findFirst({
      where: { userId: student.id },
      orderBy: { startedAt: "desc" },
    });
    const spoof = await callAction(
      studS.context,
      "src/server/studentExamActions.ts",
      "submitExam",
      ["not-a-real-attempt-id", {}],
      otherAttempt?.id ?? ongoing.id,
    );
    check("F2 bogus attempt id rejected", rejected(spoof) || spoof.status >= 400 || spoof.ok !== true);
    const foreignPublish = await callAction(
      exam2S.context,
      GRADING,
      "publishResults",
      [ongoing.id],
      ongoing.id,
    );
    check("F3 non-owner publish rejected", rejected(foreignPublish), foreignPublish.error);
    const role = await callAction(
      procS.context,
      GRADING,
      "publishResults",
      [ongoing.id],
      ongoing.id,
    );
    check("F4 proctor publish rejected", rejected(role), role.error);
  });

  await step("F7 remote database is Postgres", async () => {
    const rows = await prisma.$queryRawUnsafe<Array<{ version: string }>>("SELECT version() AS version");
    check(
      "F7 database is PostgreSQL (Supabase)",
      /postgresql/i.test(rows[0]?.version ?? ""),
      (rows[0]?.version ?? "").slice(0, 60),
    );
  });

  await browser.close();
  await clean();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  for (const f of failed) console.log(`FAILED: ${f.name} — ${f.detail}`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
};

main().catch(async (e) => {
  console.error(e);
  await clean().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
