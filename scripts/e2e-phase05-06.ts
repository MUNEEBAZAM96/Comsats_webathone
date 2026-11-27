import "dotenv/config";
import { execSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  chromium,
  type Browser,
  type Page,
} from "@playwright/test";
import { addDays, subMinutes } from "date-fns";
import prisma from "../src/lib/database/dbClient";

/**
 * Browser verification for Phase 05 (candidates) and Phase 06 (workspace).
 * Recreates the [E2E] fixtures, then drives Chromium against a running server.
 *   E2E_BASE_URL=http://localhost:3100 npx tsx scripts/e2e-phase05-06.ts
 * Set E2E_CHANNEL=msedge (or chrome) to use an installed browser instead of
 * the Playwright-managed Chromium.
 */

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
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

type Ids = Record<
  | "ongoing"
  | "shortExam"
  | "upcoming"
  | "ended"
  | "draft"
  | "unassigned"
  | "adminOwned"
  | "expiry"
  | "resume",
  string
>;

const createFixtures = (): Ids => {
  const out = execSync("npx tsx scripts/e2e-phase05-06-fixtures.ts", {
    encoding: "utf8",
  });
  return JSON.parse(out.slice(out.indexOf("{"))) as Ids;
};

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

const attemptFor = (examId: string, userId: string) =>
  prisma.examAttempt.findUnique({
    where: { userId_examId: { userId, examId } },
    include: { answers: true },
  });

const promptText = (page: Page) =>
  page.locator('[id$="-prompt"]').first().innerText();

/** Answer whichever fixture question is on screen, correctly. */
const answerCurrent = async (page: Page, shortAnswer = "queue") => {
  const prompt = await promptText(page);
  if (prompt.includes("block-scoped"))
    await page.getByRole("radio", { name: "const", exact: true }).check();
  else if (prompt.includes("idempotent"))
    for (const m of ["GET", "PUT", "DELETE"])
      await page.getByRole("checkbox", { name: m, exact: true }).check();
  else if (prompt.includes("JSON keys"))
    await page.getByRole("radio", { name: "True", exact: true }).check();
  else
    await page.locator('textarea[aria-labelledby$="-prompt"]').fill(shortAnswer);
  return prompt;
};

const waitSaved = (page: Page, timeout = 15_000) =>
  page.getByText("All answers saved").waitFor({ timeout });

const navButton = (page: Page, n: number) =>
  page
    .getByRole("navigation", { name: "Question navigation" })
    .first()
    .getByRole("button", { name: new RegExp(`^Question ${n},`) });

const goToQuestion = async (page: Page, n: number) => {
  await navButton(page, n).click();
  await page.getByText(`Question ${n} of 4`).waitFor();
};

const timerSeconds = async (page: Page) => {
  const text = (await page.getByLabel("Time remaining").innerText()).trim();
  return text
    .split(":")
    .map(Number)
    .reduce((acc, part) => acc * 60 + part, 0);
};

const main = async () => {
  const ids = createFixtures();
  console.log("fixtures", ids);
  const student = await prisma.user.findUniqueOrThrow({
    where: { email: "student@example.com" },
  });

  const browser = await chromium.launch({ channel: process.env.E2E_CHANNEL });

  // Sign-up must never let the client choose its role.
  await step("register: role cannot be escalated", async () => {
    const email = `e2e-register-${Date.now()}@example.com`;
    const res = await fetch(`${BASE}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({
        name: "E2E Register",
        email,
        password: "password-123",
        role: "admin",
      }),
    });
    const user = await prisma.user.findUnique({ where: { email } });
    check(
      "register: role cannot be escalated",
      !user || user.role === "student",
      `http ${res.status}, stored role ${user?.role ?? "none (rejected)"}`,
    );
    if (user) await prisma.user.delete({ where: { id: user.id } });
  });

  // Start the 2-minute exam first so its real expiry runs in the background.
  const short = await login(browser, "student@example.com");
  const shortDone = (async () => {
    await step("auto-submit at expiry", async () => {
      const { page } = short;
      await page.goto(`/student/exams/${ids.shortExam}`);
      await page.getByText("Question 1 of 4").waitFor();
      await answerCurrent(page);
      await waitSaved(page);
      await page.waitForURL(/\/student\/results\//, { timeout: 180_000 });
      const attempt = await attemptFor(ids.shortExam, student.id);
      check(
        "auto-submit at expiry",
        attempt?.status === "graded" || attempt?.status === "submitted",
        `status ${attempt?.status}, score ${attempt?.totalScore}/${attempt?.maxScore}`,
      );
      check(
        "auto-submit kept the saved answer",
        attempt?.answers.some((a) => a.text === "const") ?? false,
      );
    });
  })();

  const { context: sctx, page } = await login(browser, "student@example.com");

  await step("buckets", async () => {
    await page.goto("/student/exams");
    const section = (title: string) =>
      page.locator(`section[aria-labelledby="${title}-heading"]`);
    const titles = async (title: string) =>
      (await section(title).locator('[data-slot="card-title"]').allInnerTexts())
        .map((t) => t.replace("[E2E] ", ""))
        .sort();
    const available = await titles("Available");
    const upcoming = await titles("Upcoming");
    const completed = await titles("Completed");
    console.log({ available, upcoming, completed });
    check(
      "available bucket",
      ["Ongoing exam", "Mid-session expiry exam", "Resume-after-deadline exam"].every(
        (t) => available.includes(t),
      ),
      available.join(", "),
    );
    check("upcoming bucket", upcoming.includes("Upcoming exam"), upcoming.join(", "));
    check("completed bucket has missed exam", completed.includes("Ended exam"), completed.join(", "));
    const all = [...available, ...upcoming, ...completed];
    check("draft hidden", !all.some((t) => t.startsWith("Draft")));
    check("unassigned hidden", !all.includes("Unassigned exam"));
    const upcomingCard = section("Upcoming").locator('[data-slot="card"]', {
      hasText: "Upcoming exam",
    });
    check(
      "upcoming action disabled",
      await upcomingCard.getByRole("button", { name: "Not yet open" }).isDisabled(),
    );
    const endedCard = section("Completed").locator('[data-slot="card"]', {
      hasText: "Ended exam",
    });
    check("ended shows Missed", (await endedCard.innerText()).includes("Missed"));
  });

  await step("dashboard buckets", async () => {
    await page.goto("/student");
    const text = await page.locator("main").innerText();
    check(
      "dashboard lists available + upcoming",
      text.includes("Ongoing exam") && text.includes("Upcoming exam"),
    );
    check("dashboard hides draft", !text.includes("Draft exam"));
  });

  const blocked: Array<[string, string, string]> = [
    ["upcoming", ids.upcoming, "This exam has not started yet"],
    ["ended", ids.ended, "This exam has ended"],
    ["draft", ids.draft, "This exam is not available"],
    ["unassigned", ids.unassigned, "not assigned"],
  ];
  for (const [label, id, message] of blocked) {
    await step(`direct URL blocked: ${label}`, async () => {
      await page.goto(`/student/exams/${id}`);
      const body = await page.locator("main").innerText();
      const attempt = await attemptFor(id, student.id);
      check(
        `direct URL blocked: ${label}`,
        body.includes(message) && !attempt,
        attempt ? "attempt was created" : body.split("\n").slice(0, 3).join(" | "),
      );
    });
  }

  // Full workspace flow on the shuffled exam.
  const workspaceBodies: string[] = [];
  const collect = async (res: import("@playwright/test").Response) => {
    if (!res.url().startsWith(BASE)) return;
    if (/\.(js|css|woff2?|png|svg|ico|map)(\?|$)/.test(res.url())) return;
    workspaceBodies.push(await res.text().catch(() => ""));
  };
  page.on("response", collect);

  await step("workspace flow", async () => {
    await page.goto(`/student/exams/${ids.ongoing}`);
    await page.getByText("Question 1 of 4").waitFor();

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = axe.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );
    check(
      "workspace a11y (no critical/serious axe issues)",
      serious.length === 0,
      serious.map((v) => `${v.id}(${v.nodes.length})`).join(", "),
    );

    const seconds = await timerSeconds(page);
    check("timer seeded from server", seconds > 25 * 60 && seconds <= 30 * 60, `${seconds}s`);

    await answerCurrent(page);
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByText("Question 2 of 4").waitFor();
    await answerCurrent(page);
    await page.getByRole("button", { name: "Mark for review" }).click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByText("Question 3 of 4").waitFor();
    const q3 = await answerCurrent(page);
    await waitSaved(page);

    let attempt = await attemptFor(ids.ongoing, student.id);
    check("autosave persisted 3 answers", attempt?.answers.length === 3, `${attempt?.answers.length}`);

    await page.reload();
    await page.getByText("Question 1 of 4").waitFor();
    check(
      "flag persists across refresh",
      (await navButton(page, 2).getAttribute("aria-label"))?.includes("marked for review") ?? false,
    );
    check(
      "answers restored after refresh",
      (await navButton(page, 3).getAttribute("aria-label"))?.includes(", answered") ?? false,
    );
    await goToQuestion(page, 3);
    check("same question order after refresh", (await promptText(page)) === q3);

    // Offline edit, then reconnect flush.
    await goToQuestion(page, 4);
    await sctx.setOffline(true);
    await answerCurrent(page);
    await page
      .getByText("Offline — answers kept on this device")
      .waitFor({ timeout: 10_000 });
    check("offline indicator", true);
    await sctx.setOffline(false);
    await waitSaved(page, 20_000);
    attempt = await attemptFor(ids.ongoing, student.id);
    check("offline answer flushed on reconnect", attempt?.answers.length === 4);

    // Failed save, then refresh restores the pending local copy.
    const q4Id = attempt?.answers.find((a) => a.text === "queue")?.questionId;
    const shortAnswerBox = page.locator('textarea[aria-labelledby$="-prompt"]');
    for (let n = 1; n <= 4 && !(await shortAnswerBox.isVisible()); n++)
      await goToQuestion(page, n);
    await page.route("**/*", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    try {
      await shortAnswerBox.fill("a queue");
      await page
        .getByText(/could not be saved/)
        .waitFor({ timeout: 10_000 });
    } finally {
      await page.unroute("**/*");
    }
    await page.reload();
    await page.getByText("Question 1 of 4").waitFor();
    await waitSaved(page, 20_000);
    attempt = await attemptFor(ids.ongoing, student.id);
    check(
      "pending local answer restored and saved after refresh",
      attempt?.answers.some((a) => a.questionId === q4Id && a.text === "a queue") ?? false,
    );

    // Confirm dialog with counts, then submit.
    await page.getByRole("button", { name: "Review & submit" }).click();
    const dialog = page.getByRole("dialog");
    const count = async (label: string) =>
      Number(await dialog.locator("div", { has: page.locator(`dt:text-is("${label}")`) }).locator("dd").innerText());
    const counts = {
      answered: await count("Answered"),
      unanswered: await count("Unanswered"),
      review: await count("For review"),
    };
    check(
      "submit dialog counts",
      counts.answered === 4 && counts.unanswered === 0 && counts.review === 1,
      JSON.stringify(counts),
    );
    page.off("response", collect);
    await dialog.getByRole("button", { name: "Submit examination" }).click();
    await page.waitForURL(/\/student\/results\//, { timeout: 20_000 });
    attempt = await attemptFor(ids.ongoing, student.id);
    check(
      "submitted and graded",
      attempt?.status === "graded" && attempt.totalScore === 8,
      `status ${attempt?.status}, score ${attempt?.totalScore}/${attempt?.maxScore}`,
    );
    check(
      "review flags cleared after submit",
      (await page.evaluate(
        (key) => localStorage.getItem(key),
        `exam-review-flags:${attempt!.id}`,
      )) === null,
    );

    await page.goto(`/student/exams/${ids.ongoing}`);
    await page.waitForURL(/\/student\/results\//);
    const attempts = await prisma.examAttempt.count({
      where: { examId: ids.ongoing, userId: student.id },
    });
    check("reopening a submitted exam goes to results, no new attempt", attempts === 1);
  });

  check(
    "no answer keys in workspace payloads",
    workspaceBodies.length > 0 &&
      !workspaceBodies.some(
        (b) =>
          b.includes("markingScheme") ||
          /\\?"answer\\?"\s*:/.test(b) ||
          b.includes("DELETE\\nGET\\nPUT"),
      ),
    `${workspaceBodies.length} responses scanned`,
  );

  // Browser clock far in the future must not affect server time rules.
  await step("browser clock ignored", async () => {
    const skew = await login(browser, "student@example.com");
    await skew.page.clock.setFixedTime(addDays(new Date(), 3));
    await skew.page.goto(`/student/exams/${ids.expiry}`);
    await skew.page.getByText("Question 1 of 4").waitFor();
    const seconds = await timerSeconds(skew.page);
    await answerCurrent(skew.page);
    await waitSaved(skew.page);
    const attempt = await attemptFor(ids.expiry, student.id);
    check(
      "browser clock +3 days: timer and saves follow the server",
      seconds > 25 * 60 && attempt?.answers.length === 1,
      `${seconds}s left, ${attempt?.answers.length} saved`,
    );

    // Server deadline passes mid-session: saves rejected, then finalised.
    await prisma.examAttempt.update({
      where: { id: attempt!.id },
      data: { startedAt: subMinutes(new Date(), 31) },
    });
    await skew.page.getByRole("radio", { name: "var", exact: true }).check();
    // The closed queue either shows "Time is up…" or finalises straight away.
    await Promise.race([
      skew.page
        .getByText(/Time is up|could not be saved|Unsaved changes/)
        .first()
        .waitFor({ timeout: 10_000 }),
      skew.page.waitForURL(/\/student\/results\//, { timeout: 10_000 }),
    ]);
    let after = await attemptFor(ids.expiry, student.id);
    check(
      "save after server deadline is rejected",
      after?.answers[0]?.text === "const",
      `stored "${after?.answers[0]?.text}"`,
    );
    await skew.page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await skew.page.waitForURL(/\/student\/results\//, { timeout: 20_000 });
    after = await attemptFor(ids.expiry, student.id);
    check(
      "resync finalises the expired attempt",
      after?.status === "graded" || after?.status === "submitted",
      `status ${after?.status}, score ${after?.totalScore}`,
    );
    await skew.context.close();
  });

  await step("resume after deadline", async () => {
    await page.goto(`/student/exams/${ids.resume}`);
    await page.getByText("Question 1 of 4").waitFor();
    await answerCurrent(page);
    await waitSaved(page);
    const attempt = await attemptFor(ids.resume, student.id);
    await page.goto("/student/exams");
    await prisma.examAttempt.update({
      where: { id: attempt!.id },
      data: { startedAt: subMinutes(new Date(), 31) },
    });
    await page.reload();
    const card = page
      .locator('section[aria-labelledby="Completed-heading"] [data-slot="card"]')
      .filter({ hasText: "Resume-after-deadline exam" });
    check("expired in-progress attempt listed as Time up", (await card.innerText()).includes("Time up"));
    await page.goto(`/student/exams/${ids.resume}`);
    await page.waitForURL(/\/student\/results\//, { timeout: 20_000 });
    const after = await attemptFor(ids.resume, student.id);
    check(
      "resume after deadline finalises",
      after?.status === "graded" || after?.status === "submitted",
      `status ${after?.status}, score ${after?.totalScore}`,
    );
  });

  // Examiner: ownership and assignment management.
  const ex = await login(browser, "examiner@example.com");
  await step("examiner cannot manage admin-owned exam", async () => {
    await ex.page.goto(`/examiner/exams/${ids.adminOwned}/assign`);
    await ex.page.waitForLoadState("networkidle");
    check(
      "examiner cannot manage admin-owned exam",
      !ex.page.url().includes(ids.adminOwned) &&
        !(await ex.page.getByText("Assign Selected").isVisible()),
      ex.page.url().replace(BASE, ""),
    );
  });

  await step("examiner assign / duplicate / unassign", async () => {
    const assignUrl = `/examiner/exams/${ids.unassigned}/assign`;
    const second = await ex.context.newPage();
    await Promise.all([ex.page.goto(assignUrl), second.goto(assignUrl)]);
    for (const p of [ex.page, second])
      await p.getByLabel("Search students by name or email").fill("student@example.com");

    await ex.page.locator("label", { hasText: "student@example.com" }).locator("input").check();
    await ex.page.getByRole("button", { name: /Assign Selected/ }).click();
    await ex.page.getByText(/1 student\(s\) assigned/).first().waitFor();
    check("assign student", true);

    await second.locator("label", { hasText: "student@example.com" }).locator("input").check();
    await second.getByRole("button", { name: /Assign Selected/ }).click();
    await second.getByText(/0 assigned, 1 skipped/).first().waitFor();
    const assignments = await prisma.examAssignment.count({
      where: { examId: ids.unassigned, userId: student.id },
    });
    check("duplicate assign is idempotent", assignments === 1);
    await second.close();

    await ex.page.getByRole("button", { name: /^Remove .* from this exam$/ }).first().click();
    await ex.page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
    await ex.page.getByText("Student removed").first().waitFor();
    const left = await prisma.examAssignment.count({
      where: { examId: ids.unassigned, userId: student.id },
    });
    check("unassign after confirmation", left === 0);

    await ex.page.goto(`/examiner/exams/${ids.ongoing}/assign`);
    const remove = ex.page.getByRole("button", { name: /^Remove .* from this exam$/ }).first();
    check("cannot remove a student who attempted", await remove.isDisabled());

    await ex.page.goto("/examiner/exams");
    const header = await ex.page.locator("thead").innerText();
    check("exams table shows candidate count", header.includes("Candidates"));
  });

  // Admin: bulk candidate import (valid, invalid, duplicate rows).
  const ad = await login(browser, "admin@example.com");
  await step("admin candidate import", async () => {
    const stamp = Date.now();
    const csv = [
      "name,email,password",
      `E2E Import One,e2e-import-1-${stamp}@example.com,password-123`,
      `E2E Import Two,e2e-import-2-${stamp}@example.com,password-123`,
      `E2E Import Dup,e2e-import-1-${stamp}@example.com,password-123`,
      `E2E Existing,student@example.com,password-123`,
      "x,not-an-email,short",
    ].join("\n");
    const dir = mkdtempSync(path.join(tmpdir(), "e2e-"));
    const file = path.join(dir, "candidates.csv");
    writeFileSync(file, csv);
    await ad.page.goto("/admin/users");
    await ad.page.locator('input[type="file"]').first().setInputFiles(file);
    await ad.page.getByText(/Valid:/).waitFor();
    const preview = await ad.page.getByText(/Valid:/).innerText();
    check("import preview flags invalid rows", /Valid:\s*4/.test(preview) && /Invalid:\s*1/.test(preview), preview);
    await ad.page.getByRole("button", { name: /Import 4 valid row/ }).click();
    await ad.page.getByText(/Created 2, skipped 2/).first().waitFor({ timeout: 30_000 });
    const imported = await prisma.user.findMany({
      where: { email: { startsWith: "e2e-import-", endsWith: `${stamp}@example.com` } },
      include: { accounts: true },
    });
    check(
      "imported candidates are students with credential accounts",
      imported.length === 2 &&
        imported.every(
          (u) => u.role === "student" && u.accounts[0]?.accountId === u.id,
        ),
    );

    const signIn = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email: imported[0]?.email, password: "password-123" }),
    });
    check("imported candidate can sign in", signIn.ok, `http ${signIn.status}`);
    await prisma.user.deleteMany({ where: { id: { in: imported.map((u) => u.id) } } });
  });

  await shortDone;
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  for (const f of failed) console.log(`FAILED: ${f.name} ${f.detail}`);
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
