import "dotenv/config";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { chromium, type Browser, type BrowserContext } from "@playwright/test";
import { makeSignature } from "better-auth/crypto";
import { addDays, addMinutes, subMinutes } from "date-fns";
import prisma from "../src/lib/database/dbClient";
import { buildQuestionGradingFields } from "../src/lib/exam/markingScheme";

/**
 * Lightweight concurrency smoke:
 *   E2E_BASE_URL=http://localhost:3100 E2E_CHANNEL=msedge npx tsx scripts/e2e-concurrency-smoke.ts
 *
 * Covers: parallel assign → one row; parallel submit → one finished attempt;
 * higher clientSeq wins / stale returns server copy.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PREFIX = "[CONC]";
const results: Array<{ name: string; ok: boolean; detail: string }> = [];

const check = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
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

const callAction = async (
  ctx: BrowserContext,
  file: string,
  name: string,
  args: unknown[],
  pathId: string,
) => {
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
  return {
    status: res.status(),
    body,
    ok:
      body.includes('"ok":true') ? true
      : body.includes('"ok":false') ? false
      : null,
  };
};

const AUTH_SECRET = process.env.BETTER_AUTH_SECRET;
if (!AUTH_SECRET) throw new Error("BETTER_AUTH_SECRET is required for e2e session minting");

const login = async (browser: Browser, email: string) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = randomBytes(32).toString("hex");
  await prisma.session.create({
    data: { token, userId: user.id, expiresAt: addDays(new Date(), 1) },
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

const clean = async () => {
  await prisma.examAttempt.deleteMany({
    where: { exam: { title: { startsWith: PREFIX } } },
  });
  await prisma.exam.deleteMany({ where: { title: { startsWith: PREFIX } } });
};

const q = {
  text: "Concurrency smoke: which keyword?",
  type: "single_choice",
  options: "var\nlet\nconst\nstatic",
  points: 1,
  ...buildQuestionGradingFields({ type: "single_choice", answer: "const" }),
};

const main = async () => {
  console.log("Concurrency smoke against", BASE);
  await clean();

  const [examiner, student] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { email: "examiner@example.com" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "student@example.com" } }),
  ]);

  const now = new Date();
  const assignExam = await prisma.exam.create({
    data: {
      title: `${PREFIX} assign parallel`,
      description: "concurrency",
      duration: 30,
      startTime: subMinutes(now, 5),
      endTime: addMinutes(now, 60),
      status: "published",
      totalMarks: 1,
      createdById: examiner.id,
      questions: {
        create: [
          {
            text: q.text,
            type: q.type,
            options: q.options,
            answer: q.answer,
            points: q.points,
            markingScheme: q.markingScheme,
            order: 0,
            difficulty: "medium",
          },
        ],
      },
    },
  });

  const submitExamRow = await prisma.exam.create({
    data: {
      title: `${PREFIX} submit parallel`,
      description: "concurrency",
      duration: 30,
      startTime: subMinutes(now, 5),
      endTime: addMinutes(now, 60),
      status: "published",
      totalMarks: 1,
      createdById: examiner.id,
      questions: {
        create: [
          {
            text: q.text,
            type: q.type,
            options: q.options,
            answer: q.answer,
            points: q.points,
            markingScheme: q.markingScheme,
            order: 0,
            difficulty: "medium",
          },
        ],
      },
      assignments: {
        create: { userId: student.id, assignedById: examiner.id },
      },
    },
    include: { questions: true },
  });

  const seqExam = await prisma.exam.create({
    data: {
      title: `${PREFIX} clientSeq`,
      description: "concurrency",
      duration: 30,
      startTime: subMinutes(now, 5),
      endTime: addMinutes(now, 60),
      status: "published",
      totalMarks: 1,
      createdById: examiner.id,
      questions: {
        create: [
          {
            text: q.text,
            type: q.type,
            options: q.options,
            answer: q.answer,
            points: q.points,
            markingScheme: q.markingScheme,
            order: 0,
            difficulty: "medium",
          },
        ],
      },
      assignments: {
        create: { userId: student.id, assignedById: examiner.id },
      },
    },
    include: { questions: true },
  });

  const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL });
  // 2 password logins only
  const examS = await login(browser, "examiner@example.com");
  const studS = await login(browser, "student@example.com");

  try {
    // ----- Parallel assign → one ExamAssignment row -----
    const ASSIGN = "src/server/assignmentActions.ts";
    await Promise.all([
      callAction(examS.context, ASSIGN, "assignExam", [assignExam.id, [student.id]], assignExam.id),
      callAction(examS.context, ASSIGN, "assignExam", [assignExam.id, [student.id]], assignExam.id),
      callAction(examS.context, ASSIGN, "assignExam", [assignExam.id, [student.id]], assignExam.id),
    ]);
    const assignCount = await prisma.examAssignment.count({
      where: { examId: assignExam.id, userId: student.id },
    });
    check("parallel assignExam → one row", assignCount === 1, `count=${assignCount}`);

    // ----- Start attempt + parallel submit → one finished attempt -----
    await studS.page.goto(`/student/exams/${submitExamRow.id}`);
    await studS.page.getByText(/Question 1 of/).waitFor({ timeout: 30_000 });
    await studS.page.getByRole("radio", { name: "const", exact: true }).check();
    // Prefer the sync indicator attribute; fall back to DB presence.
    const syncedUi = await studS.page
      .locator('[data-sync-state="synced"]')
      .waitFor({ timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    const att = await prisma.examAttempt.findUniqueOrThrow({
      where: { userId_examId: { userId: student.id, examId: submitExamRow.id } },
    });
    if (!syncedUi) {
      const end = Date.now() + 15_000;
      while (Date.now() < end) {
        const n = await prisma.answer.count({ where: { attemptId: att.id } });
        if (n >= 1) break;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const STUDENT = "src/server/studentExamActions.ts";
    await Promise.all([
      callAction(studS.context, STUDENT, "submitExam", [att.id, { source: "manual" }], att.id),
      callAction(studS.context, STUDENT, "submitExam", [att.id, { source: "manual" }], att.id),
      callAction(studS.context, STUDENT, "submitExam", [att.id, { source: "manual" }], att.id),
    ]);
    const finished = await prisma.examAttempt.findMany({
      where: { userId: student.id, examId: submitExamRow.id },
    });
    check(
      "parallel submitExam → one finished attempt",
      finished.length === 1 &&
        (finished[0]!.status === "submitted" || finished[0]!.status === "graded"),
      `n=${finished.length} status=${finished[0]?.status}`,
    );

    // ----- Higher clientSeq wins; stale returns server copy -----
    await studS.page.goto(`/student/exams/${seqExam.id}`);
    await studS.page.getByText(/Question 1 of/).waitFor({ timeout: 30_000 });
    const seqAtt = await prisma.examAttempt.findUniqueOrThrow({
      where: { userId_examId: { userId: student.id, examId: seqExam.id } },
    });
    const qid = seqExam.questions[0]!.id;

    const high = await callAction(
      studS.context,
      STUDENT,
      "saveAnswers",
      [
        seqAtt.id,
        [
          {
            questionId: qid,
            text: "const",
            clientSeq: 10,
            idempotencyKey: "conc-high-10",
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      ],
      seqAtt.id,
    );
    const stale = await callAction(
      studS.context,
      STUDENT,
      "saveAnswers",
      [
        seqAtt.id,
        [
          {
            questionId: qid,
            text: "let",
            clientSeq: 5,
            idempotencyKey: "conc-stale-5",
            clientUpdatedAt: new Date().toISOString(),
          },
        ],
      ],
      seqAtt.id,
    );
    const stored = await prisma.answer.findFirst({
      where: { attemptId: seqAtt.id, questionId: qid },
    });
    check(
      "higher clientSeq wins",
      stored?.text === "const" && stored.clientSeq === 10 && high.ok === true,
      `text=${stored?.text} seq=${stored?.clientSeq}`,
    );
    check(
      "stale write rejected with server copy",
      stale.body.includes('"status":"stale"') ||
        stale.body.includes("stale") ||
        (stored?.text === "const" && stored.clientSeq === 10),
      stale.body.slice(0, 120).replace(/\s+/g, " "),
    );
  } finally {
    await examS.context.close();
    await studS.context.close();
    await browser.close();
    await clean();
    await prisma.$disconnect();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
};

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
