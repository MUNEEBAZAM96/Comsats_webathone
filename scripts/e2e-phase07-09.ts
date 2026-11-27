import "dotenv/config";
import { readFileSync } from "node:fs";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
  type Response,
} from "@playwright/test";
import { addMinutes, subHours, subMinutes, subSeconds } from "date-fns";
import prisma from "../src/lib/database/dbClient";
import { hashPasswordFunction } from "../src/lib/argon2";
import { buildQuestionGradingFields } from "../src/lib/exam/markingScheme";

/**
 * Browser verification for Phase 07 (resilience), 08 (monitoring) and 09
 * (grading and results) against a running production server:
 *   E2E_BASE_URL=http://localhost:3100 E2E_CHANNEL=msedge npx tsx scripts/e2e-phase07-09.ts
 * Server actions are called over HTTP with each role's session cookies (IDs
 * from `.next/server/server-reference-manifest.json`), and every result is
 * checked against the database.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const PREFIX = "[E2E7]";
const SECRET = "E2E7-SECRET-ANSWER";
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

// ---------------------------------------------------------------------------
// Server actions over HTTP
// ---------------------------------------------------------------------------

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

/** A page that hosts the action, with dynamic segments filled by `id`. */
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

/** Rejected: an `ok:false` result, a thrown error, or a redirect away. */
const rejected = (r: ActionResponse) => r.ok === false || r.status >= 300 || r.ok === null;

const GRADING = "src/server/gradingActions.ts";
const MONITOR = "src/server/monitoringActions.ts";
const EXPORTS = "src/server/importExportActions.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseQuestions = [
  {
    text: "Which keyword declares a block-scoped constant in JavaScript?",
    type: "single_choice",
    options: "var\nlet\nconst\nstatic",
    answer: "const",
    points: 2,
  },
  {
    text: "Select every HTTP method that is idempotent by definition.",
    type: "multiple_choice",
    options: "GET\nPOST\nPUT\nDELETE",
    answer: "DELETE\nGET\nPUT",
    points: 3,
  },
  {
    text: "JSON keys must be wrapped in double quotes.",
    type: "true_false",
    options: "True\nFalse",
    answer: "True",
    points: 1,
  },
  {
    text: "Name the data structure that follows first-in, first-out order.",
    type: "short_answer",
    options: null,
    answer: "queue",
    points: 2,
  },
];

const withScheme = (
  q: (typeof baseQuestions)[number],
  extra: Parameters<typeof buildQuestionGradingFields>[0] | null = null,
) => ({
  ...q,
  ...buildQuestionGradingFields(extra ?? { type: q.type, answer: q.answer }),
});

const gradingQuestions = [
  withScheme(baseQuestions[0]!),
  withScheme(baseQuestions[1]!, {
    type: "multiple_choice",
    answer: "DELETE\nGET\nPUT",
    multiSelectRule: "partial_with_penalty",
    wrongPenalty: 1,
  }),
  withScheme(baseQuestions[2]!),
  withScheme(baseQuestions[3]!),
  {
    text: "Explain what a closure is in JavaScript.",
    type: "long_answer",
    options: null,
    points: 4,
    ...buildQuestionGradingFields({
      type: "long_answer",
      answer: "Function bundled with its lexical environment.",
    }),
  },
];

const TEMP_USERS = [
  { email: "e2e7-examiner2@example.com", name: "E2E7 Other Examiner", role: "examiner" },
  { email: "e2e7-proctor2@example.com", name: "E2E7 Other Proctor", role: "proctor" },
];

const cleanFixtures = async () => {
  await prisma.examAttempt.deleteMany({ where: { exam: { title: { startsWith: PREFIX } } } });
  await prisma.exam.deleteMany({ where: { title: { startsWith: PREFIX } } });
  await prisma.user.deleteMany({ where: { email: { in: TEMP_USERS.map((u) => u.email) } } });
};

const createFixtures = async () => {
  await cleanFixtures();
  const [examiner, proctor, student] = await Promise.all(
    ["examiner@example.com", "proctor@example.com", "student@example.com"].map((email) =>
      prisma.user.findUniqueOrThrow({ where: { email } }),
    ),
  );
  for (const u of TEMP_USERS) {
    const user = await prisma.user.create({
      data: { email: u.email, name: u.name, role: u.role, emailVerified: true },
    });
    await prisma.account.create({
      data: {
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPasswordFunction(u.email),
      },
    });
  }

  const now = new Date();
  const make = async (
    title: string,
    questions: Array<Record<string, unknown> & { points: number }>,
    extra: { resultReveal?: string; passMarkPercent?: number } = {},
  ) =>
    prisma.exam.create({
      data: {
        title: `${PREFIX} ${title}`,
        description: "Phase 07–09 verification fixture",
        duration: 30,
        startTime: subMinutes(now, 10),
        endTime: addMinutes(now, 120),
        status: "published",
        totalMarks: questions.reduce((s, q) => s + q.points, 0),
        createdById: examiner.id,
        ...extra,
        questions: {
          create: questions.map((q, order) => ({ ...(q as never as object), order })) as never,
        },
        assignments: { create: { userId: student.id, assignedById: examiner.id } },
        proctors: { create: { proctorId: proctor.id, assignedById: examiner.id } },
      },
    });

  const sync = await make("Resilience exam", baseQuestions.map((q) => withScheme(q)));
  const deadline = await make("Offline deadline exam", baseQuestions.map((q) => withScheme(q)));
  const grading = await make("Grading exam", gradingQuestions, {
    resultReveal: "score_only",
    passMarkPercent: 50,
  });
  return { sync: sync.id, deadline: deadline.id, grading: grading.id };
};

// ---------------------------------------------------------------------------
// Browser helpers
// ---------------------------------------------------------------------------

const login = async (browser: Browser, email: string) => {
  const context = await browser.newContext({ baseURL: BASE });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(email);
  await page.locator('form button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname !== "/", { timeout: 20_000 });
  return { context, page };
};

/** Another device for the same user: shares the session cookie only. */
const cloneContext = async (browser: Browser, ctx: BrowserContext) =>
  browser.newContext({
    baseURL: BASE,
    storageState: { cookies: (await ctx.storageState()).cookies, origins: [] },
  });

const waitSaved = (page: Page, timeout = 20_000) =>
  page.getByText("All answers saved").waitFor({ timeout });

const next = async (page: Page, n: number, of: number) => {
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByText(`Question ${n} of ${of}`).waitFor();
};

const navButton = (page: Page, n: number) =>
  page
    .getByRole("navigation", { name: "Question navigation" })
    .first()
    .getByRole("button", { name: new RegExp(`^Question ${n},`) });

const goTo = async (page: Page, n: number, of: number) => {
  await navButton(page, n).click();
  await page.getByText(`Question ${n} of ${of}`).waitFor();
};

const textBox = (page: Page) => page.locator('textarea[aria-labelledby$="-prompt"]');

const timerSeconds = async (page: Page) =>
  (await page.getByLabel("Time remaining").innerText())
    .trim()
    .split(":")
    .map(Number)
    .reduce((acc, part) => acc * 60 + part, 0);

const attemptFor = (examId: string, userId: string) =>
  prisma.examAttempt.findUnique({
    where: { userId_examId: { userId, examId } },
    include: { answers: { include: { question: { select: { order: true } } } } },
  });

const answerByOrder = (
  attempt: Awaited<ReturnType<typeof attemptFor>>,
  order: number,
) => attempt?.answers.find((a) => a.question.order === order);

const until = async (fn: () => Promise<boolean>, timeout: number, every = 1000) => {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, every));
  }
  return fn();
};

const collector = (page: Page) => {
  const bodies: string[] = [];
  const onResponse = async (res: Response) => {
    if (!res.url().startsWith(BASE)) return;
    if (/\.(js|css|woff2?|png|svg|ico|map)(\?|$)/.test(res.url())) return;
    bodies.push(await res.text().catch(() => ""));
  };
  page.on("response", onResponse);
  return { bodies, stop: () => page.off("response", onResponse) };
};

const leaksKeys = (bodies: string[]) =>
  bodies.some(
    (b) =>
      b.includes("markingScheme") ||
      /\\?"answer\\?"\s*:\s*\\?"/.test(b) ||
      b.includes("DELETE\\nGET\\nPUT"),
  );

// ---------------------------------------------------------------------------

const main = async () => {
  const ids = await createFixtures();
  console.log("fixtures", ids);
  const [student, examiner] = await Promise.all(
    ["student@example.com", "examiner@example.com"].map((email) =>
      prisma.user.findUniqueOrThrow({ where: { email } }),
    ),
  );

  const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL });
  const S = await login(browser, "student@example.com");
  const E = await login(browser, "examiner@example.com");
  const P = await login(browser, "proctor@example.com");
  const E2 = await login(browser, "e2e7-examiner2@example.com");
  const P2 = await login(browser, "e2e7-proctor2@example.com");

  // ----- Phase 08: monitor access --------------------------------------------
  const monitorUrl = `/proctor/exams/${ids.sync}`;
  const studentRow = (status?: string) =>
    P.page.locator(
      `[data-candidate="student@example.com"]${status ? `[data-status="${status}"]` : ""}`,
    );
  const monitorScan = collector(P.page);

  await step("monitor access", async () => {
    await P.page.goto(monitorUrl);
    await studentRow().waitFor({ timeout: 15_000 });
    check("assigned proctor opens the monitor", true);
    check(
      "candidate who has not started is listed as not_started",
      await studentRow("not_started").isVisible(),
    );

    await P2.page.goto(monitorUrl);
    await P2.page.waitForLoadState("networkidle");
    check(
      "unassigned proctor is denied the monitor page",
      !(await P2.page.locator("[data-candidate]").count()) &&
        (await P2.page.locator("main").innerText()).includes("Monitor unavailable"),
    );
    await E2.page.goto(`/examiner/exams/${ids.sync}/monitor`);
    await E2.page.waitForLoadState("networkidle");
    check(
      "non-owner examiner is denied the monitor page",
      !(await E2.page.locator("[data-candidate]").count()),
    );
    const p2 = await callAction(P2.context, MONITOR, "refreshExamMonitor", [ids.sync], ids.sync);
    const e2 = await callAction(E2.context, MONITOR, "refreshExamMonitor", [ids.sync], ids.sync);
    const p1 = await callAction(P.context, MONITOR, "refreshExamMonitor", [ids.sync], ids.sync);
    check("monitor action rejects unassigned proctor", rejected(p2), p2.error);
    check("monitor action rejects non-owner examiner", rejected(e2), e2.error);
    check("monitor action allows assigned proctor", p1.ok === true);
  });

  // ----- Phase 07: offline answers survive a closed tab -----------------------
  let sPage = await S.context.newPage();
  await step("offline answers survive closing the tab", async () => {
    await sPage.goto(`/student/exams/${ids.sync}`);
    await sPage.getByText("Question 1 of 4").waitFor();
    const live = await studentRow("in_progress")
      .waitFor({ timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    check("monitor shows in_progress within 10s of starting", live);

    await S.context.setOffline(true);
    await sPage.getByRole("radio", { name: "const", exact: true }).check();
    await next(sPage, 2, 4);
    for (const m of ["GET", "PUT", "DELETE"])
      await sPage.getByRole("checkbox", { name: m, exact: true }).check();
    await next(sPage, 3, 4);
    await sPage.getByRole("radio", { name: "True", exact: true }).check();
    await sPage.getByText(/Offline — answers kept on this device \(3 /).waitFor({ timeout: 10_000 });
    check("offline indicator counts 3 unsent answers", true);
    let attempt = await attemptFor(ids.sync, student.id);
    check("nothing reached the server while offline", attempt?.answers.length === 0);

    // A plain reload cannot load while offline (no service worker), so the
    // tab is closed instead and the exam reopened once the network is back.
    await sPage.close();
    await S.context.setOffline(false);
    sPage = await S.context.newPage();
    await sPage.goto(`/student/exams/${ids.sync}`);
    await sPage.getByText("Question 1 of 4").waitFor();
    await until(
      async () => (await attemptFor(ids.sync, student.id))?.answers.length === 3,
      20_000,
    );
    await waitSaved(sPage);
    attempt = await attemptFor(ids.sync, student.id);
    check(
      "all 3 offline answers recovered from IndexedDB and saved",
      attempt?.answers.length === 3 && attempt.answers.every((a) => a.clientSeq >= 1),
      attempt?.answers.map((a) => `${a.question.order}:${a.clientSeq}`).join(", "),
    );
    const counted = await P.page
      .getByText("3/4 answered")
      .waitFor({ timeout: 12_000 })
      .then(() => true)
      .catch(() => false);
    check("monitor answered count updates", counted);

    const before = answerByOrder(attempt, 0)!.clientSeq;
    await sPage.getByRole("radio", { name: "let", exact: true }).check();
    await waitSaved(sPage);
    attempt = await attemptFor(ids.sync, student.id);
    check(
      "a later edit raises clientSeq in the database",
      answerByOrder(attempt, 0)!.clientSeq > before && answerByOrder(attempt, 0)!.text === "let",
      `${before} → ${answerByOrder(attempt, 0)!.clientSeq}`,
    );
  });

  await step("failed save is recovered after reload", async () => {
    await goTo(sPage, 4, 4);
    await sPage.route("**/*", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    try {
      await textBox(sPage).fill(`a queue ${SECRET}`);
      await sPage.getByText(/could not be saved/).waitFor({ timeout: 15_000 });
    } finally {
      await sPage.unroute("**/*");
    }
    await sPage.reload();
    await sPage.getByText("Question 1 of 4").waitFor();
    const recovered = await until(
      async () =>
        answerByOrder(await attemptFor(ids.sync, student.id), 3)?.text === `a queue ${SECRET}`,
      20_000,
    );
    check("aborted save recovered and stored after reload", recovered);
  });

  // ----- Phase 08: connection state and connection_lost -----------------------
  await step("offline candidate shows as offline", async () => {
    const attempt = await attemptFor(ids.sync, student.id);
    await S.context.setOffline(true);
    await prisma.examAttempt.update({
      where: { id: attempt!.id },
      data: { lastSeenAt: subSeconds(new Date(), 60) },
    });
    const idle = await P.page
      .locator('[data-candidate="student@example.com"][data-connection="idle"]')
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    check("monitor shows idle after 45s without a heartbeat", idle);
    await prisma.examAttempt.update({
      where: { id: attempt!.id },
      data: { lastSeenAt: subMinutes(new Date(), 3) },
    });
    const offline = await P.page
      .locator('[data-candidate="student@example.com"][data-connection="offline"]')
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    check("monitor shows offline after 2 min without a heartbeat", offline);
    await S.context.setOffline(false);
    const logged = await until(
      async () =>
        (await prisma.attemptEvent.count({
          where: { attemptId: attempt!.id, type: "connection_lost" },
        })) > 0,
      20_000,
    );
    check("connection_lost recorded after reconnect", logged);
  });

  // ----- Phase 08: announcements ---------------------------------------------
  await step("announcements reach the workspace", async () => {
    const message = `E2E7 announcement ${Date.now()}: re-read question 2`;
    const created = await callAction(
      E.context,
      MONITOR,
      "createAnnouncement",
      [{ examId: ids.sync, message, priority: "important" }],
      ids.sync,
    );
    check("examiner creates an announcement", created.ok === true, created.error);
    const shown = await sPage
      .getByText(message)
      .first()
      .waitFor({ timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    check("announcement appears in the workspace within 25s", shown);
    const row = await prisma.examAnnouncement.findFirstOrThrow({ where: { message } });
    await sPage.getByRole("button", { name: "Dismiss announcement" }).click();
    const read = await until(
      async () =>
        (await prisma.announcementRead.count({
          where: { announcementId: row.id, userId: student.id },
        })) === 1,
      10_000,
    );
    check("announcement read is stored", read);

    const retract = await callAction(E.context, MONITOR, "retractAnnouncement", [row.id], ids.sync);
    check("announcement retracted", retract.ok === true, retract.error);
    await sPage.reload();
    await sPage.getByText("Question 1 of 4").waitFor();
    await sPage.waitForTimeout(1500);
    check(
      "retracted announcement disappears",
      !(await sPage.getByRole("button", { name: /Announcements/ }).isVisible()) &&
        (await sPage.getByText(message).count()) === 0,
    );
  });

  // ----- Phase 08: incidents --------------------------------------------------
  await step("incidents", async () => {
    const description = `E2E7 candidate reported a frozen screen ${Date.now()}`;
    const created = await callAction(
      P.context,
      MONITOR,
      "createIncident",
      [
        {
          examId: ids.sync,
          candidateId: student.id,
          category: "technical",
          severity: "low",
          description,
        },
      ],
      ids.sync,
    );
    const incident = await prisma.examIncident.findFirst({ where: { description } });
    check("proctor records an incident", created.ok === true && !!incident, created.error);
    const byProctor = await callAction(
      P.context,
      MONITOR,
      "updateIncidentStatus",
      [{ incidentId: incident!.id, status: "resolved", resolutionNote: "Proctor tried" }],
      ids.sync,
    );
    const afterProctor = await prisma.examIncident.findUniqueOrThrow({ where: { id: incident!.id } });
    check(
      "proctor cannot resolve an incident",
      rejected(byProctor) && afterProctor.status === "open" && !afterProctor.resolvedAt,
      byProctor.error,
    );
    const byOwner = await callAction(
      E.context,
      MONITOR,
      "updateIncidentStatus",
      [{ incidentId: incident!.id, status: "resolved", resolutionNote: "Restarted browser; no concern" }],
      ids.sync,
    );
    const resolved = await prisma.examIncident.findUniqueOrThrow({ where: { id: incident!.id } });
    check(
      "examiner resolves: resolvedById and resolvedAt stored",
      byOwner.ok === true &&
        resolved.status === "resolved" &&
        resolved.resolvedById === examiner.id &&
        !!resolved.resolvedAt,
    );
  });

  // ----- Phase 07: two tabs and a stale write from a second device ------------
  await step("two tabs and stale writes", async () => {
    const tab2 = await S.context.newPage();
    await tab2.goto(`/student/exams/${ids.sync}`);
    const warned = await tab2
      .getByText(/already open in another tab/)
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    check("second tab shows the already-open warning", warned);
    await tab2.close();

    // Web Locks can be shared across contexts of one browser, so the second
    // device runs in its own browser process.
    const browserB = await chromium.launch({ channel: process.env.E2E_CHANNEL });
    const deviceB = await cloneContext(browserB, S.context);
    const bPage = await deviceB.newPage();
    await bPage.goto(`/student/exams/${ids.sync}`);
    await bPage.getByText("Question 1 of 4").waitFor();
    await goTo(bPage, 4, 4);

    await goTo(sPage, 4, 4);
    await textBox(sPage).fill("from-device-A");
    await until(
      async () =>
        answerByOrder(await attemptFor(ids.sync, student.id), 3)?.text === "from-device-A",
      15_000,
    );
    const seqA = answerByOrder(await attemptFor(ids.sync, student.id), 3)!.clientSeq;

    await textBox(bPage).fill("from-device-B");
    const toast = await bPage
      .getByText(/was changed in another tab or device/)
      .waitFor({ timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const stored = answerByOrder(await attemptFor(ids.sync, student.id), 3)!;
    check(
      "stale write keeps the higher sequence in the database",
      stored.text === "from-device-A" && stored.clientSeq === seqA,
      `"${stored.text}" seq ${stored.clientSeq}`,
    );
    check("stale device shows the conflict toast", toast);
    await browserB.close();
  });

  // ----- Phase 07: timer never increases after a resync -----------------------
  await step("timer is monotonic with a skewed clock", async () => {
    const skewed = await cloneContext(browser, S.context);
    const page = await skewed.newPage();
    await page.clock.setFixedTime(subHours(new Date(), 5));
    await page.goto(`/student/exams/${ids.sync}`);
    await page.getByText("Question 1 of 4").waitFor();
    const samples = [await timerSeconds(page)];
    for (let i = 0; i < 2; i++) {
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.waitForTimeout(2500);
      samples.push(await timerSeconds(page));
    }
    check(
      "timer never increases across resyncs (browser clock −5h)",
      samples[0]! <= 30 * 60 && samples.every((s, i) => i === 0 || s <= samples[i - 1]!),
      samples.join(" → "),
    );
    await skewed.close();
  });

  // ----- Phase 07: deadline passes while offline ------------------------------
  await step("deadline passes while offline", async () => {
    const page = await S.context.newPage();
    await page.goto(`/student/exams/${ids.deadline}`);
    await page.getByText("Question 1 of 4").waitFor();
    await page.getByRole("radio", { name: "const", exact: true }).check();
    await waitSaved(page);
    const attempt = await attemptFor(ids.deadline, student.id);
    await S.context.setOffline(true);
    await prisma.examAttempt.update({
      where: { id: attempt!.id },
      data: { startedAt: subMinutes(new Date(), 31) },
    });
    await next(page, 2, 4);
    await page.getByRole("checkbox", { name: "GET", exact: true }).check();
    await page.waitForTimeout(800);
    await S.context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.waitForURL(/\/student\/results\//, { timeout: 30_000 });
    const after = await attemptFor(ids.deadline, student.id);
    check(
      "offline deadline: attempt finalised on reconnect",
      after?.status === "submitted" || after?.status === "graded",
      `status ${after?.status}`,
    );
    // Finalising adds blank rows for unanswered questions; the late text must not be kept.
    const late = answerByOrder(after, 1)?.text ?? "";
    check(
      "offline deadline: late answer not stored",
      answerByOrder(after, 0)?.text === "const" && late.trim() === "",
      `q2 stored "${late}"`,
    );
    await page.close();
  });

  monitorScan.stop();
  check(
    "monitor payloads carry no answer keys or answer text",
    monitorScan.bodies.length > 0 &&
      !leaksKeys(monitorScan.bodies) &&
      !monitorScan.bodies.some((b) => b.includes(SECRET) || b.includes("from-device-A")),
    `${monitorScan.bodies.length} responses scanned`,
  );

  // ----- Phase 09: submit with a manual question ------------------------------
  await step("grading flow", async () => {
    const page = sPage;
    await page.goto(`/student/exams/${ids.grading}`);
    await page.getByText("Question 1 of 5").waitFor();
    await page.getByRole("radio", { name: "const", exact: true }).check();
    await next(page, 2, 5);
    for (const m of ["GET", "PUT", "POST"])
      await page.getByRole("checkbox", { name: m, exact: true }).check();
    await next(page, 3, 5);
    await page.getByRole("radio", { name: "True", exact: true }).check();
    await next(page, 4, 5);
    await textBox(page).fill("a queue");
    await next(page, 5, 5);
    await textBox(page).fill("A closure keeps access to variables from the scope where it was created.");
    await waitSaved(page);
    await page.getByRole("button", { name: "Review & submit" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Submit examination" }).click();

    const resultScan = collector(page);
    await page.waitForURL(/\/student\/results\//, { timeout: 20_000 });
    await page.waitForLoadState("networkidle");
    let attempt = await attemptFor(ids.grading, student.id);
    check(
      "submitted with a pending manual answer: status submitted, total null",
      attempt?.status === "submitted" && attempt.totalScore === null && attempt.autoScore === 6,
      `status ${attempt?.status}, auto ${attempt?.autoScore}, total ${attempt?.totalScore}`,
    );
    const body = await page.locator("main").innerText();
    resultScan.stop();
    check(
      "student sees the awaiting-results state",
      /Being graded|awaiting results/.test(body),
    );
    check(
      "unpublished result payload has no keys or scores",
      !leaksKeys(resultScan.bodies) &&
        !resultScan.bodies.some((b) => /\\?"(autoScore|totalScore|score)\\?"\s*:\s*\d/.test(b)),
      `${resultScan.bodies.length} responses scanned`,
    );

    const pending = await callAction(E.context, GRADING, "publishResults", [ids.grading], ids.grading);
    check(
      "publish blocked while a manual mark is pending (with counts)",
      pending.ok === false && /1/.test(pending.error),
      pending.error,
    );

    // Authorisation before marking.
    const longAnswer = answerByOrder(attempt, 4)!;
    const gradeInput = [{ answerId: longAnswer.id, score: 4, feedback: "not allowed" }];
    const byOther = await callAction(E2.context, GRADING, "saveManualGrade", gradeInput, ids.grading);
    const byProctor = await callAction(P.context, GRADING, "saveManualGrade", gradeInput, ids.grading);
    const publishByOther = await callAction(E2.context, GRADING, "publishResults", [ids.grading], ids.grading);
    attempt = await attemptFor(ids.grading, student.id);
    check(
      "non-owner examiner cannot grade (action)",
      rejected(byOther) && answerByOrder(attempt, 4)!.manualScore === null,
      byOther.error,
    );
    check(
      "proctor cannot grade (action)",
      rejected(byProctor) && answerByOrder(attempt, 4)!.manualScore === null,
      byProctor.error,
    );
    await E2.page.goto(`/examiner/exams/${ids.grading}/grading`);
    await E2.page.waitForLoadState("networkidle");
    check(
      "non-owner examiner cannot open grading (page)",
      !(await E2.page.getByTestId("grading-progress").count()),
    );
    await P.page.goto(`/examiner/exams/${ids.grading}/grading`);
    await P.page.waitForLoadState("networkidle");
    check(
      "proctor cannot open grading (page)",
      !P.page.url().includes("/grading") || !(await P.page.getByTestId("grading-progress").count()),
      P.page.url().replace(BASE, ""),
    );

    // Owner marks the long answer in the grading workspace.
    await E.page.goto(`/examiner/exams/${ids.grading}/grading`);
    await E.page.getByTestId("grading-progress").waitFor({ timeout: 15_000 });
    check(
      "grading queue lists the pending answer",
      (await E.page.getByTestId("grading-progress").innerText()).includes("1 pending"),
      await E.page.getByTestId("grading-progress").innerText(),
    );
    await E.page.locator("#grade-score").fill("3");
    await E.page.locator("#grade-feedback").fill("Clear explanation of closures.");
    await E.page.getByRole("button", { name: /Save & next/ }).click();
    await E.page.getByText(/0 pending/).first().waitFor({ timeout: 15_000 });
    attempt = await attemptFor(ids.grading, student.id);
    const gradeAudits = await prisma.gradeAudit.count({
      where: { examId: ids.grading, action: "grade" },
    });
    check(
      "manual mark: graded, total = auto + manual, one audit",
      attempt?.status === "graded" &&
        attempt.totalScore === 9 &&
        attempt.manualScore === 3 &&
        gradeAudits === 1,
      `status ${attempt?.status}, total ${attempt?.totalScore}, audits ${gradeAudits}`,
    );
    const stillUnpublished = await prisma.exam.findUniqueOrThrow({ where: { id: ids.grading } });
    check(
      "non-owner examiner cannot publish (action)",
      rejected(publishByOther) && !stillUnpublished.resultsPublishedAt,
      publishByOther.error,
    );

    // Publish through the results page.
    await E.page.goto(`/examiner/exams/${ids.grading}/results`);
    await E.page.getByRole("button", { name: "Publish results" }).click();
    const confirm = E.page.getByRole("alertdialog");
    check(
      "publish dialog states the candidate count",
      (await confirm.innerText()).includes("1 candidate will"),
    );
    await confirm.getByRole("button", { name: "Publish to 1" }).click();
    await E.page.getByTestId("results-published").waitFor({ timeout: 15_000 });
    const published = await prisma.exam.findUniqueOrThrow({ where: { id: ids.grading } });
    check("results published", !!published.resultsPublishedAt);

    await page.goto(`/student/results/${attempt!.id}`);
    await page.getByTestId("result-total").waitFor();
    let text = await page.locator("main").innerText();
    check(
      "student sees score and feedback (score_only)",
      (await page.getByTestId("result-total").innerText()) === "9/12" &&
        text.includes("Clear explanation of closures."),
      await page.getByTestId("result-total").innerText(),
    );
    check(
      "score_only hides correct answers",
      !text.includes("(Correct answer)") && text.includes("Correct answers are not"),
    );

    // Override is locked while published; unpublish → override → republish.
    const q1 = answerByOrder(attempt, 0)!;
    const overrideInput = [{ answerId: q1.id, score: 1.5, reason: "Accept partial reasoning" }];
    const locked = await callAction(E.context, GRADING, "overrideAutoScore", overrideInput, ids.grading);
    const q1Locked = answerByOrder(await attemptFor(ids.grading, student.id), 0)!;
    check(
      "override blocked while results are published",
      rejected(locked) && q1Locked.manualScore === null,
      locked.error,
    );
    const unpublish = await callAction(
      E.context,
      GRADING,
      "unpublishResults",
      [{ examId: ids.grading, reason: "Re-check question 1" }],
      ids.grading,
    );
    check("owner withdraws results with a reason", unpublish.ok === true, unpublish.error);
    const settings = await callAction(
      E.context,
      GRADING,
      "updateResultSettings",
      [{ examId: ids.grading, resultReveal: "score_and_answers", passMarkPercent: 50 }],
      ids.grading,
    );
    check("result visibility switched while unpublished", settings.ok === true, settings.error);
    const override = await callAction(E.context, GRADING, "overrideAutoScore", overrideInput, ids.grading);
    const republish = await callAction(E.context, GRADING, "publishResults", [ids.grading], ids.grading);
    attempt = await attemptFor(ids.grading, student.id);
    const audits = await prisma.gradeAudit.groupBy({
      by: ["action"],
      where: { examId: ids.grading },
      _count: true,
    });
    const auditCount = (a: string) => audits.find((x) => x.action === a)?._count ?? 0;
    check(
      "override after unpublish: total updated, override + unpublish audited",
      override.ok === true &&
        republish.ok === true &&
        attempt?.totalScore === 8.5 &&
        auditCount("override") === 1 &&
        auditCount("unpublish") === 1 &&
        auditCount("publish") === 2,
      `total ${attempt?.totalScore}; audits ${audits.map((a) => `${a.action}=${a._count}`).join(", ")}`,
    );

    await page.goto(`/student/results/${attempt!.id}`);
    await page.getByTestId("result-total").waitFor();
    text = await page.locator("main").innerText();
    check(
      "score_and_answers shows correct answers and the adjusted score",
      text.includes("(Correct answer)") &&
        (await page.getByTestId("result-total").innerText()) === "8.5/12",
      await page.getByTestId("result-total").innerText(),
    );

    // Analytics: one graded attempt at 8.5/12 with a 50% pass mark.
    await E.page.goto(`/examiner/exams/${ids.grading}/results`);
    const analytics = await E.page.getByTestId("exam-analytics").innerText();
    const stat = (label: string) =>
      new RegExp(`^${label.replace(/[()]/g, "\\$&")}\\s*\\n\\s*([^\\n]+)`, "m")
        .exec(analytics)?.[1]
        ?.trim();
    check(
      "analytics match hand-computed values",
      stat("Mean (of 12)") === "8.5" &&
        stat("Median") === "8.5" &&
        stat("Std deviation") === "0" &&
        /100%/.test(stat("Pass rate (≥50%)") ?? "") &&
        stat("Submitted") === "1",
      `mean ${stat("Mean (of 12)")}, median ${stat("Median")}, sd ${stat("Std deviation")}, pass ${stat("Pass rate (≥50%)")}`,
    );

    const csv = await callAction(E.context, EXPORTS, "exportExamResultsAction", [ids.grading, "csv"], ids.grading);
    check(
      "CSV export has the grading columns",
      ["autoScore", "manualScore", "totalScore", "percentage", "status", "gradedAt", "submitSource"].every(
        (c) => csv.body.includes(c),
      ) && csv.body.includes("8.5"),
    );
    const csvOther = await callAction(E2.context, EXPORTS, "exportExamResultsAction", [ids.grading, "csv"], ids.grading);
    check(
      "non-owner examiner cannot export",
      !csvOther.body.includes("student@example.com"),
      `http ${csvOther.status}`,
    );
  });

  await browser.close();
  await cleanFixtures();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  for (const f of failed) console.log(`FAILED: ${f.name} ${f.detail}`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
};

main().catch(async (e) => {
  console.error(e);
  await cleanFixtures().catch(() => undefined);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
