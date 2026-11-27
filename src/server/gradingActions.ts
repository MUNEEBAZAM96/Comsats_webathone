"use server";

import "server-only";
import { addHours, isAfter } from "date-fns";
import { revalidatePath, updateTag } from "next/cache";
import prisma from "@/lib/database/dbClient";
import { gradeAnswer, isManualQuestion, roundScore } from "@/lib/exam/grading";
import { getEffectiveExamStatus } from "@/lib/exam/lifecycle";
import { splitLines } from "@/lib/exam/markingScheme";
import {
  manualGradeSchema,
  resultSettingsSchema,
  scoreOverrideSchema,
  unpublishResultsSchema,
  type ManualGradeFormType,
  type ResultSettingsFormType,
  type ScoreOverrideFormType,
} from "@/lib/zodSchema";
import { ActionError, runAction } from "@/server/actionResult";
import { lockAttempt, recomputeAttemptTotals } from "@/server/attemptGrading";
import { finalizeExpiredAttempts } from "@/server/attemptSweep";
import {
  assertCanManageExam,
  assertPermission,
  requireStaffSession,
  type StaffSession,
} from "@/server/examAccess";

/** An owning examiner may withdraw published results for this long; admins any time. */
const UNPUBLISH_WINDOW_HOURS = 24;

const PUBLISHED_LOCK_MESSAGE =
  "Results are published. Withdraw them before changing marks.";

const gradeSession = async () => {
  const session = await requireStaffSession("admin", "examiner");
  await assertPermission(session, { result: ["grade"] });
  return session;
};

const publishSession = async () => {
  const session = await requireStaffSession("admin", "examiner");
  await assertPermission(session, { result: ["publish"] });
  return session;
};

const revalidateResults = (examId: string, attemptIds: string[] = []) => {
  updateTag("admin-dashboard");
  updateTag("examiner-dashboard");
  for (const base of ["/admin", "/examiner"]) {
    revalidatePath(`${base}/exams/${examId}/results`);
    revalidatePath(`${base}/exams/${examId}/grading`);
    revalidatePath(`${base}/results`);
    for (const id of attemptIds) revalidatePath(`${base}/results/${id}`);
  }
  revalidatePath("/proctor/results");
  revalidatePath("/student");
  revalidatePath("/student/results", "layout");
};

// ---------------------------------------------------------------------------
// Publication readiness
// ---------------------------------------------------------------------------

const loadPublicationState = async (
  exam: Awaited<ReturnType<typeof assertCanManageExam>>,
  session: StaffSession,
  now = new Date(),
) => {
  const [assigned, attempts, pendingManual, publishedBy] = await Promise.all([
    prisma.examAssignment.findMany({
      where: { examId: exam.id },
      select: { userId: true },
    }),
    prisma.examAttempt.findMany({
      where: { examId: exam.id },
      select: { userId: true, status: true },
    }),
    prisma.answer.count({
      where: {
        attempt: { examId: exam.id, status: { not: "in_progress" } },
        requiresManual: true,
        manualScore: null,
      },
    }),
    exam.resultsPublishedById ?
      prisma.user.findUnique({
        where: { id: exam.resultsPublishedById },
        select: { name: true },
      })
    : null,
  ]);

  const effectiveStatus = getEffectiveExamStatus(exam, now);
  const finishedUsers = new Set(
    attempts.filter((a) => a.status !== "in_progress").map((a) => a.userId),
  );
  const inProgress = attempts.filter((a) => a.status === "in_progress").length;
  const finished = finishedUsers.size;
  const assignedNotFinished = assigned.filter(
    (a) => !finishedUsers.has(a.userId),
  ).length;

  const blockers: string[] = [];
  if (exam.status === "draft") blockers.push("The exam is still a draft.");
  if (finished === 0) blockers.push("No candidate has submitted yet.");
  if (inProgress > 0)
    blockers.push(
      `${inProgress} attempt${inProgress === 1 ? " is" : "s are"} still in progress.`,
    );
  if (pendingManual > 0)
    blockers.push(
      `${pendingManual} answer${pendingManual === 1 ? " still needs" : "s still need"} a manual mark.`,
    );
  if (
    exam.status !== "draft" &&
    effectiveStatus !== "completed" &&
    assignedNotFinished > 0
  )
    blockers.push(
      `The exam window is still open and ${assignedNotFinished} of ${assigned.length} assigned candidate${assigned.length === 1 ? " has" : "s have"} not finished.`,
    );

  const publishedAt = exam.resultsPublishedAt;
  const unpublishUntil =
    publishedAt && session.user.role !== "admin" ?
      addHours(publishedAt, UNPUBLISH_WINDOW_HOURS)
    : null;
  const canUnpublish =
    !!publishedAt &&
    (session.user.role === "admin" ||
      (unpublishUntil !== null && !isAfter(now, unpublishUntil)));

  return {
    effectiveStatus,
    publishedAt,
    publishedByName: publishedBy?.name ?? null,
    resultReveal: exam.resultReveal,
    assigned: assigned.length,
    finished,
    inProgress,
    pendingManual,
    blockers,
    canPublish: !publishedAt && blockers.length === 0,
    canUnpublish,
    unpublishUntil,
  };
};

export type PublicationState = Awaited<ReturnType<typeof loadPublicationState>>;

/** Readiness, counts and blockers for the publish controls. */
export const getPublicationState = async (examId: string) => {
  const session = await publishSession();
  const exam = await assertCanManageExam(examId, session);
  await finalizeExpiredAttempts(exam.id);
  return loadPublicationState(exam, session);
};

export const publishResults = async (examId: string) =>
  runAction(async () => {
    const session = await publishSession();
    const exam = await assertCanManageExam(examId, session);
    if (exam.resultsPublishedAt)
      throw new ActionError("Results are already published.");
    await finalizeExpiredAttempts(exam.id);
    const state = await loadPublicationState(exam, session);
    if (state.blockers.length > 0)
      throw new ActionError(`Cannot publish yet: ${state.blockers.join(" ")}`);

    const now = new Date();
    await prisma.$transaction(async (tx) => {
      const updated = await tx.exam.updateMany({
        where: { id: exam.id, resultsPublishedAt: null },
        data: { resultsPublishedAt: now, resultsPublishedById: session.user.id },
      });
      if (updated.count === 0)
        throw new ActionError("Results are already published.");
      await tx.gradeAudit.create({
        data: {
          examId: exam.id,
          action: "publish",
          reason: `Published to ${state.finished} candidate${state.finished === 1 ? "" : "s"} (${exam.resultReveal})`,
          gradedById: session.user.id,
        },
      });
    });
    revalidateResults(exam.id);
    return { publishedAt: now, candidates: state.finished };
  });

export const unpublishResults = async (input: { examId: string; reason: string }) =>
  runAction(async () => {
    const session = await publishSession();
    const parsed = unpublishResultsSchema.safeParse(input);
    if (!parsed.success)
      throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid input");
    const exam = await assertCanManageExam(parsed.data.examId, session);
    if (!exam.resultsPublishedAt)
      throw new ActionError("Results are not published.");
    if (
      session.user.role !== "admin" &&
      isAfter(new Date(), addHours(exam.resultsPublishedAt, UNPUBLISH_WINDOW_HOURS))
    )
      throw new ActionError(
        `Results were published more than ${UNPUBLISH_WINDOW_HOURS} hours ago. Ask an admin to withdraw them.`,
      );

    await prisma.$transaction(async (tx) => {
      const updated = await tx.exam.updateMany({
        where: { id: exam.id, resultsPublishedAt: { not: null } },
        data: { resultsPublishedAt: null, resultsPublishedById: null },
      });
      if (updated.count === 0) throw new ActionError("Results are not published.");
      await tx.gradeAudit.create({
        data: {
          examId: exam.id,
          action: "unpublish",
          reason: parsed.data.reason,
          gradedById: session.user.id,
        },
      });
    });
    revalidateResults(exam.id);
    return { unpublished: true };
  });

/** What candidates see and the pass mark; editable until results are published. */
export const updateResultSettings = async (input: ResultSettingsFormType) =>
  runAction(async () => {
    const session = await publishSession();
    const parsed = resultSettingsSchema.safeParse(input);
    if (!parsed.success)
      throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid settings");
    const exam = await assertCanManageExam(parsed.data.examId, session);
    if (exam.resultsPublishedAt)
      throw new ActionError("Withdraw published results before changing these settings.");
    await prisma.exam.update({
      where: { id: exam.id },
      data: {
        resultReveal: parsed.data.resultReveal,
        passMarkPercent: parsed.data.passMarkPercent,
      },
    });
    revalidateResults(exam.id);
    for (const base of ["/admin", "/examiner"]) revalidatePath(`${base}/exams/${exam.id}`);
    return {
      resultReveal: parsed.data.resultReveal,
      passMarkPercent: parsed.data.passMarkPercent,
    };
  });

// ---------------------------------------------------------------------------
// Grading queue
// ---------------------------------------------------------------------------

export type GradingQueueOptions = {
  by?: "question" | "candidate";
  status?: "pending" | "graded" | "all";
  anonymize?: boolean;
};

/**
 * Finished attempts' answers that a person marks (manual questions, including
 * blank ones to confirm) or has overridden. Answer keys are included: this is
 * staff-only and requires `result:grade`.
 */
export const getGradingQueue = async (
  examId: string,
  options: GradingQueueOptions = {},
) => {
  const session = await gradeSession();
  const exam = await assertCanManageExam(examId, session);
  await finalizeExpiredAttempts(exam.id);
  const by: "question" | "candidate" =
    options.by === "candidate" ? "candidate" : "question";
  const status: "pending" | "graded" | "all" =
    options.status === "pending" || options.status === "graded" ?
      options.status
    : "all";
  const anonymize = options.anonymize === true;

  const [attempts, inProgress] = await Promise.all([
    prisma.examAttempt.findMany({
      where: { examId: exam.id, status: { not: "in_progress" } },
      orderBy: { id: "asc" },
      select: {
        id: true,
        status: true,
        user: { select: { id: true, name: true, email: true } },
        answers: {
          where: { attemptQuestionId: { not: null } },
          select: {
            id: true,
            text: true,
            score: true,
            autoScore: true,
            manualScore: true,
            requiresManual: true,
            feedback: true,
            gradedAt: true,
            gradedBy: { select: { name: true } },
            attemptQuestion: {
              select: {
                sourceQuestionId: true,
                text: true,
                type: true,
                options: true,
                answer: true,
                points: true,
                order: true,
                markingScheme: true,
              },
            },
          },
        },
      },
    }),
    prisma.examAttempt.count({
      where: { examId: exam.id, status: "in_progress" },
    }),
  ]);

  // Question order comes from the exam (snapshot order may be shuffled per attempt).
  const examQuestions = await prisma.question.findMany({
    where: { examId: exam.id },
    select: { id: true, order: true },
  });
  const examOrder = new Map(examQuestions.map((q) => [q.id, q.order]));

  const items = attempts.flatMap((attempt, index) =>
    attempt.answers.flatMap((a) => {
      const snap = a.attemptQuestion;
      if (!snap) return [];
      const manualQuestion = isManualQuestion({
        type: snap.type,
        answer: snap.answer,
        points: snap.points,
        markingScheme: snap.markingScheme,
      });
      const overridden = !manualQuestion && a.manualScore != null;
      if (!manualQuestion && !overridden) return [];
      const blank = !a.text?.trim();
      const pending = a.requiresManual && a.manualScore == null;
      const choice =
        snap.type === "multiple_choice" ||
        snap.type === "single_choice" ||
        snap.type === "true_false";
      const detail =
        choice ?
          gradeAnswer(a.text ?? "", {
            type: snap.type,
            answer: snap.answer,
            points: snap.points,
            markingScheme: snap.markingScheme,
            options: snap.options,
          }).detail
        : null;
      return [
        {
          answerId: a.id,
          attemptId: attempt.id,
          attemptStatus: attempt.status,
          candidate: {
            label: `Candidate #${index + 1}`,
            name: anonymize ? null : attempt.user.name,
            email: anonymize ? null : attempt.user.email,
          },
          questionId: snap.sourceQuestionId,
          questionNumber: (examOrder.get(snap.sourceQuestionId) ?? snap.order) + 1,
          questionText: snap.text,
          questionType: snap.type,
          options: choice ? splitLines(snap.options) : [],
          points: snap.points,
          /** Model answer / rubric for manual questions; correct option(s) otherwise. */
          guidance: snap.answer?.trim() ? snap.answer : null,
          text: a.text ?? "",
          blank,
          kind:
            overridden ? ("override" as const)
            : blank ? ("blank" as const)
            : ("manual" as const),
          state: pending ? ("pending" as const) : ("graded" as const),
          autoScore: a.autoScore,
          manualScore: a.manualScore,
          score: a.score,
          feedback: a.feedback,
          gradedAt: a.gradedAt,
          gradedBy: a.gradedBy?.name ?? null,
          detail,
        },
      ];
    }),
  );

  const filtered = items.filter((i) => status === "all" || i.state === status);
  filtered.sort((a, b) =>
    by === "question" ?
      a.questionNumber - b.questionNumber ||
      a.candidate.label.localeCompare(b.candidate.label, undefined, { numeric: true })
    : a.candidate.label.localeCompare(b.candidate.label, undefined, { numeric: true }) ||
      a.questionNumber - b.questionNumber,
  );

  return {
    exam: {
      id: exam.id,
      title: exam.title,
      resultsPublishedAt: exam.resultsPublishedAt,
      effectiveStatus: getEffectiveExamStatus(exam),
    },
    options: { by, status, anonymize },
    summary: {
      finishedAttempts: attempts.length,
      inProgress,
      pending: items.filter((i) => i.state === "pending").length,
      graded: items.filter((i) => i.state === "graded").length,
      total: items.length,
    },
    items: filtered,
  };
};

export type GradingQueue = Awaited<ReturnType<typeof getGradingQueue>>;
export type GradingQueueItem = GradingQueue["items"][number];

/** Client refresh wrapper: never throws. */
export const loadGradingQueue = async (
  examId: string,
  options: GradingQueueOptions = {},
) => runAction(() => getGradingQueue(examId, options));

// ---------------------------------------------------------------------------
// Marking
// ---------------------------------------------------------------------------

const loadAnswerForMarking = async (answerId: string, session: StaffSession) => {
  const answer = await prisma.answer.findUnique({
    where: { id: answerId },
    select: {
      id: true,
      attemptId: true,
      requiresManual: true,
      attempt: { select: { examId: true, status: true } },
      attemptQuestion: {
        select: {
          type: true,
          answer: true,
          points: true,
          markingScheme: true,
        },
      },
    },
  });
  if (!answer) throw new ActionError("Answer not found.");
  const exam = await assertCanManageExam(answer.attempt.examId, session);
  if (exam.resultsPublishedAt) throw new ActionError(PUBLISHED_LOCK_MESSAGE);
  if (answer.attempt.status === "in_progress")
    throw new ActionError("The candidate is still writing this exam.");
  if (!answer.attemptQuestion)
    throw new ActionError("The question snapshot for this answer is missing.");
  return { answer, snapshot: answer.attemptQuestion, exam };
};

const assertWithinPoints = (score: number, points: number) => {
  if (score > points)
    throw new ActionError(`Score cannot exceed ${points} point${points === 1 ? "" : "s"}.`);
};

const markingResult = async (
  answerId: string,
  attemptTotals: { pending: number; total: number | null },
) => {
  const fresh = await prisma.answer.findUniqueOrThrow({
    where: { id: answerId },
    select: {
      id: true,
      score: true,
      autoScore: true,
      manualScore: true,
      feedback: true,
      gradedAt: true,
      gradedBy: { select: { name: true } },
      attempt: { select: { id: true, status: true, totalScore: true } },
    },
  });
  return {
    answerId: fresh.id,
    score: fresh.score,
    autoScore: fresh.autoScore,
    manualScore: fresh.manualScore,
    feedback: fresh.feedback,
    gradedAt: fresh.gradedAt,
    gradedBy: fresh.gradedBy?.name ?? null,
    attempt: {
      id: fresh.attempt.id,
      status: fresh.attempt.status,
      totalScore: fresh.attempt.totalScore,
      pending: attemptTotals.pending,
    },
  };
};

/** Mark a written answer (or confirm a blank one). Blocked once results are published. */
export const saveManualGrade = async (input: ManualGradeFormType) =>
  runAction(async () => {
    const session = await gradeSession();
    const parsed = manualGradeSchema.safeParse(input);
    if (!parsed.success)
      throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid mark");
    const { answerId, score, feedback } = parsed.data;
    const { answer, snapshot, exam } = await loadAnswerForMarking(answerId, session);

    const manualQuestion = isManualQuestion({
      type: snapshot.type,
      answer: snapshot.answer,
      points: snapshot.points,
      markingScheme: snapshot.markingScheme,
    });
    if (!answer.requiresManual && !manualQuestion)
      throw new ActionError(
        "This answer is marked automatically. Use an override with a reason instead.",
      );
    assertWithinPoints(score, snapshot.points);

    const totals = await prisma.$transaction(
      async (tx) => {
        const status = await lockAttempt(tx, answer.attemptId);
        if (status === "in_progress")
          throw new ActionError("The candidate is still writing this exam.");
        const current = await tx.answer.findUniqueOrThrow({
          where: { id: answerId },
          select: { score: true, manualScore: true },
        });
        const now = new Date();
        const newScore = roundScore(score);
        await tx.answer.update({
          where: { id: answerId },
          data: {
            manualScore: newScore,
            score: newScore,
            feedback: feedback?.trim() ? feedback.trim() : null,
            gradedById: session.user.id,
            gradedAt: now,
          },
        });
        await tx.gradeAudit.create({
          data: {
            examId: exam.id,
            answerId,
            action: "grade",
            previousScore: current.manualScore ?? current.score,
            newScore,
            gradedById: session.user.id,
          },
        });
        return recomputeAttemptTotals(tx, answer.attemptId, session.user.id);
      },
      { timeout: 20_000 },
    );
    revalidateResults(exam.id, [answer.attemptId]);
    return markingResult(answerId, totals);
  });

/**
 * Replace an automatic score (or a manual mark) with a reason. `score: null`
 * restores the automatic score. Blocked once results are published.
 */
export const overrideAutoScore = async (input: ScoreOverrideFormType) =>
  runAction(async () => {
    const session = await gradeSession();
    const parsed = scoreOverrideSchema.safeParse(input);
    if (!parsed.success)
      throw new ActionError(parsed.error.issues[0]?.message ?? "Invalid override");
    const { answerId, score, reason } = parsed.data;
    const { answer, snapshot, exam } = await loadAnswerForMarking(answerId, session);
    if (score === null && answer.requiresManual)
      throw new ActionError(
        "Written answers have no automatic score to restore. Enter a mark instead.",
      );
    if (score !== null) assertWithinPoints(score, snapshot.points);

    const totals = await prisma.$transaction(
      async (tx) => {
        const status = await lockAttempt(tx, answer.attemptId);
        if (status === "in_progress")
          throw new ActionError("The candidate is still writing this exam.");
        const current = await tx.answer.findUniqueOrThrow({
          where: { id: answerId },
          select: { score: true, autoScore: true, manualScore: true },
        });
        if (score === null && current.manualScore == null)
          throw new ActionError("This answer already uses its automatic score.");
        const newScore = score === null ? current.autoScore : roundScore(score);
        await tx.answer.update({
          where: { id: answerId },
          data:
            score === null ?
              {
                manualScore: null,
                score: current.autoScore,
                gradedById: null,
                gradedAt: null,
              }
            : {
                manualScore: newScore,
                score: newScore,
                gradedById: session.user.id,
                gradedAt: new Date(),
              },
        });
        await tx.gradeAudit.create({
          data: {
            examId: exam.id,
            answerId,
            action: "override",
            previousScore: current.score,
            newScore,
            reason,
            gradedById: session.user.id,
          },
        });
        return recomputeAttemptTotals(tx, answer.attemptId, session.user.id);
      },
      { timeout: 20_000 },
    );
    revalidateResults(exam.id, [answer.attemptId]);
    return markingResult(answerId, totals);
  });

/**
 * Re-run automatic grading from each attempt's frozen snapshots (for example
 * after correcting a snapshot's marking scheme). Manual marks are preserved;
 * every changed score is audited.
 */
export const regradeExam = async (examId: string) =>
  runAction(async () => {
    const session = await gradeSession();
    const exam = await assertCanManageExam(examId, session);
    if (exam.resultsPublishedAt) throw new ActionError(PUBLISHED_LOCK_MESSAGE);
    await finalizeExpiredAttempts(exam.id);

    const attempts = await prisma.examAttempt.findMany({
      where: { examId: exam.id, status: { not: "in_progress" } },
      select: { id: true },
    });

    let changed = 0;
    const touched: string[] = [];
    for (const { id: attemptId } of attempts) {
      const attemptChanges = await prisma.$transaction(
        async (tx) => {
          const status = await lockAttempt(tx, attemptId);
          if (status === "in_progress" || status === null) return 0;
          const answers = await tx.answer.findMany({
            where: { attemptId, attemptQuestionId: { not: null } },
            select: {
              id: true,
              text: true,
              score: true,
              autoScore: true,
              manualScore: true,
              requiresManual: true,
              attemptQuestion: {
                select: {
                  type: true,
                  answer: true,
                  points: true,
                  markingScheme: true,
                  options: true,
                },
              },
            },
          });
          let count = 0;
          for (const a of answers) {
            if (!a.attemptQuestion) continue;
            const result = gradeAnswer(a.text ?? "", a.attemptQuestion);
            const autoScore = result.requiresManual ? null : result.score;
            const score =
              a.manualScore != null ? a.manualScore
              : result.requiresManual ? null
              : result.score;
            if (
              autoScore === a.autoScore &&
              result.requiresManual === a.requiresManual &&
              score === a.score
            )
              continue;
            await tx.answer.update({
              where: { id: a.id },
              data: { autoScore, requiresManual: result.requiresManual, score },
            });
            if (score !== a.score)
              await tx.gradeAudit.create({
                data: {
                  examId: exam.id,
                  answerId: a.id,
                  action: "regrade",
                  previousScore: a.score,
                  newScore: score,
                  reason: "Automatic re-grade from snapshots",
                  gradedById: session.user.id,
                },
              });
            count++;
          }
          if (count > 0) await recomputeAttemptTotals(tx, attemptId, null);
          return count;
        },
        { timeout: 30_000 },
      );
      if (attemptChanges > 0) {
        changed += attemptChanges;
        touched.push(attemptId);
      }
    }
    revalidateResults(exam.id, touched);
    return { attempts: attempts.length, changedAnswers: changed, changedAttempts: touched.length };
  });

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

const HISTORY_LIMIT = 200;

/** Grade and publication audit trail for an exam (optionally one answer). */
export const getGradeHistory = async (
  examId: string,
  filter: { answerId?: string } = {},
) =>
  runAction(async () => {
    const session = await gradeSession();
    const exam = await assertCanManageExam(examId, session);
    const answerId =
      typeof filter.answerId === "string" && filter.answerId.length <= 64 ?
        filter.answerId
      : undefined;
    const audits = await prisma.gradeAudit.findMany({
      where: { examId: exam.id, ...(answerId ? { answerId } : {}) },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        action: true,
        previousScore: true,
        newScore: true,
        reason: true,
        createdAt: true,
        gradedBy: { select: { name: true } },
        answer: {
          select: {
            attempt: { select: { user: { select: { name: true } } } },
            attemptQuestion: { select: { text: true, points: true } },
          },
        },
      },
    });
    return audits.map((a) => ({
      id: a.id,
      action: a.action,
      previousScore: a.previousScore,
      newScore: a.newScore,
      reason: a.reason,
      createdAt: a.createdAt,
      by: a.gradedBy.name,
      candidate: a.answer?.attempt.user.name ?? null,
      question: a.answer?.attemptQuestion?.text ?? null,
      points: a.answer?.attemptQuestion?.points ?? null,
    }));
  });

export type GradeHistoryEntry = Extract<
  Awaited<ReturnType<typeof getGradeHistory>>,
  { ok: true }
>["data"][number];
