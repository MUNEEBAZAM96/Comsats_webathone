"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import {
  assertCanPublishExam,
  refreshExamTotalMarks,
  syncExamLifecycle,
  withExamApiFields,
} from "@/lib/exam/lifecycle";
import { buildQuestionGradingFields } from "@/lib/exam/markingScheme";
import { z, ZodError } from "zod";
import { examFormSchema, questionFormSchema } from "@/lib/zodSchema";

const zodMessage = (e: ZodError) =>
  e.issues
    .map((i) =>
      [i.path.length ? i.path.join(".") : "", i.message]
        .filter(Boolean)
        .join(": "),
    )
    .join("; ");

const revalidateExamDashboard = (role?: string | null) => {
  if (role === "admin") revalidateTag("admin-dashboard", "max");
  else revalidateTag("examiner-dashboard", "max");
};

const basePathFor = (role?: string | null) =>
  role === "admin" ? "/admin" : "/examiner";

/** Admin or examiner only — mutations and sensitive reads. */
const requireExamStaff = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.role !== "admin" && session.user.role !== "examiner")
    redirect("/");
  return session;
};

const assertExamOwnerOrAdmin = (
  session: { user: { id: string; role?: string | null } },
  createdById: string,
  action: string,
) => {
  if (session.user.role !== "admin" && createdById !== session.user.id)
    throw new Error(`You do not have permission to ${action} this exam`);
};

export const getExams = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const role = session.user.role;
  if (role !== "admin" && role !== "examiner") redirect("/");

  try {
    const rows = await prisma.exam.findMany({
      where: role === "admin" ? undefined : { createdById: session.user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { questions: true, assignments: true } },
        createdBy: { select: { name: true } },
      },
    });

    const now = new Date();
    const synced = await Promise.all(
      rows.map(async (exam) => {
        const next = await syncExamLifecycle(exam, now);
        return withExamApiFields(next, now);
      }),
    );
    return synced;
  } catch {
    throw new Error("Failed to fetch exams");
  }
};

export const getExamById = async (id: string) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");

  const { success: canRead } = await auth.api
    .userHasPermission({
      body: { userId: session.user.id, permissions: { exam: ["read"] } },
    })
    .catch(() => ({ success: false as const }));
  if (!canRead) redirect("/");

  // Proctors also hold exam:read (for monitoring), but this returns the
  // questions with their answer keys, so only admins and examiners may load it.
  if (session.user.role !== "admin" && session.user.role !== "examiner")
    redirect("/");

  let exam;
  try {
    exam = await prisma.exam.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { order: "asc" } },
        createdBy: { select: { name: true } },
      },
    });
  } catch {
    throw new Error("Failed to fetch exam");
  }

  if (!exam) {
    if (session.user.role === "admin") redirect("/admin/exams");
    redirect("/examiner/exams");
  }

  if (session.user.role === "examiner" && exam.createdById !== session.user.id)
    redirect("/examiner/exams");

  const now = new Date();
  const synced = await syncExamLifecycle(exam, now);

  // Draft with questions but totalMarks still 0 → recompute for API consumers
  let totalMarks = synced.totalMarks;
  if (
    synced.status === "draft" &&
    totalMarks === 0 &&
    synced.questions.length > 0
  ) {
    totalMarks = await refreshExamTotalMarks(synced.id);
  }

  return withExamApiFields({ ...synced, totalMarks }, now);
};

export const createExam = async (formData: FormData) => {
  const session = await requireExamStaff();

  let exam: Awaited<ReturnType<typeof prisma.exam.create>>;
  try {
    const parsed = examFormSchema.parse(Object.fromEntries(formData));

    exam = await prisma.exam.create({
      data: {
        title: parsed.title,
        description: parsed.description || null,
        instructions: parsed.instructions || null,
        duration: parsed.duration,
        startTime: parsed.startTime ? new Date(parsed.startTime) : null,
        endTime: parsed.endTime ? new Date(parsed.endTime) : null,
        shuffleQuestions: parsed.shuffleQuestions ?? false,
        shuffleOptions: parsed.shuffleOptions ?? false,
        resultReveal: parsed.resultReveal,
        passMarkPercent: parsed.passMarkPercent ?? null,
        status: "draft",
        totalMarks: 0,
        createdById: session.user.id,
      },
    });

    const basePath = basePathFor(session.user.role);
    revalidatePath(`${basePath}/exams`);
    revalidateExamDashboard(session.user.role);
  } catch (e) {
    if (e instanceof ZodError) throw new Error(zodMessage(e));
    if (e instanceof Error) throw e;
    throw new Error("Failed to create exam");
  }
  return {
    id: exam.id,
    basePath: basePathFor(session.user.role),
  };
};

export const updateExam = async (id: string, formData: FormData) => {
  const session = await requireExamStaff();

  try {
    const exam = await prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new Error("Exam not found");

    assertExamOwnerOrAdmin(session, exam.createdById, "update");

    if (exam.status !== "draft")
      throw new Error("Only draft exams can be edited");

    const parsed = examFormSchema.parse(Object.fromEntries(formData));

    await prisma.exam.update({
      where: { id },
      data: {
        title: parsed.title,
        description: parsed.description || null,
        // Preserve instructions when legacy UI omits the field
        ...(formData.has("instructions") ?
          { instructions: parsed.instructions || null }
        : {}),
        duration: parsed.duration,
        startTime: parsed.startTime ? new Date(parsed.startTime) : null,
        endTime: parsed.endTime ? new Date(parsed.endTime) : null,
        ...(formData.has("shuffleQuestions") ?
          { shuffleQuestions: parsed.shuffleQuestions ?? false }
        : {}),
        ...(formData.has("shuffleOptions") ?
          { shuffleOptions: parsed.shuffleOptions ?? false }
        : {}),
        ...(formData.has("resultReveal") ? { resultReveal: parsed.resultReveal } : {}),
        ...(formData.has("passMarkPercent") ?
          { passMarkPercent: parsed.passMarkPercent ?? null }
        : {}),
      },
    });

    const basePath = basePathFor(session.user.role);
    revalidatePath(`${basePath}/exams/${id}`);
    revalidateExamDashboard(session.user.role);
  } catch (e) {
    if (e instanceof ZodError) throw new Error(zodMessage(e));
    if (e instanceof Error) throw e;
    throw new Error("Failed to update exam");
  }
};

export const deleteExam = async (id: string) => {
  const session = await requireExamStaff();

  try {
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: { _count: { select: { attempts: true } } },
    });
    if (!exam) throw new Error("Exam not found");

    assertExamOwnerOrAdmin(session, exam.createdById, "delete");

    const attemptCount = exam._count.attempts;

    if (session.user.role !== "admin") {
      if (exam.status !== "draft")
        throw new Error("Examiners can only delete draft exams");
      if (attemptCount > 0)
        throw new Error("Cannot delete an exam that has student attempts");
    } else {
      // Admin: draft always; published/completed only with zero attempts
      if (exam.status !== "draft" && attemptCount > 0) {
        throw new Error(
          "Cannot delete a published or completed exam that has student attempts",
        );
      }
    }

    await prisma.exam.delete({ where: { id } });

    const basePath = basePathFor(session.user.role);
    revalidatePath(`${basePath}/exams`);
    revalidateExamDashboard(session.user.role);
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to delete exam");
  }
};

export const publishExam = async (id: string) => {
  const session = await requireExamStaff();

  try {
    const exam = await prisma.exam.findUnique({
      where: { id },
      include: { _count: { select: { questions: true } } },
    });
    if (!exam) throw new Error("Exam not found");

    assertExamOwnerOrAdmin(session, exam.createdById, "publish");

    await prisma.$transaction(async (tx) => {
      const locked = await tx.exam.findUnique({
        where: { id },
        include: { _count: { select: { questions: true } } },
      });
      if (!locked) throw new Error("Exam not found");

      assertCanPublishExam({
        status: locked.status,
        duration: locked.duration,
        startTime: locked.startTime,
        endTime: locked.endTime,
        questionCount: locked._count.questions,
      });

      const questions = await tx.question.findMany({
        where: { examId: id },
        select: {
          id: true,
          text: true,
          type: true,
          options: true,
          answer: true,
          points: true,
        },
      });
      const { evaluatePublishReadiness } = await import(
        "@/lib/exam/publishReadiness"
      );
      const readiness = evaluatePublishReadiness({
        title: locked.title,
        duration: locked.duration,
        startTime: locked.startTime,
        endTime: locked.endTime,
        passMarkPercent: locked.passMarkPercent,
        questions,
      });
      if (!readiness.ready) {
        throw new Error(
          readiness.issues[0]?.message ?? "Exam is not ready to publish",
        );
      }

      await tx.exam.update({
        where: { id },
        data: { status: "published", totalMarks: readiness.totalMarks },
      });
    });

    const basePath = basePathFor(session.user.role);
    revalidatePath(`${basePath}/exams/${id}`);
    revalidatePath(`${basePath}/exams`);
    revalidateExamDashboard(session.user.role);
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to publish exam");
  }
};

export const completeExam = async (id: string) => {
  const session = await requireExamStaff();

  try {
    const exam = await prisma.exam.findUnique({ where: { id } });
    if (!exam) throw new Error("Exam not found");

    assertExamOwnerOrAdmin(session, exam.createdById, "complete");

    const synced = await syncExamLifecycle(exam);

    if (synced.status === "draft")
      throw new Error("Draft exams cannot be completed; publish first");
    if (synced.status === "completed")
      throw new Error("Exam is already completed");
    if (synced.status !== "published")
      throw new Error("Only published exams can be completed");

    await prisma.exam.update({
      where: { id },
      data: { status: "completed" },
    });

    const basePath = basePathFor(session.user.role);
    revalidatePath(`${basePath}/exams/${id}`);
    revalidatePath(`${basePath}/exams`);
    revalidateExamDashboard(session.user.role);
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to complete exam");
  }
};

const assertDraftExamMutable = async (
  exam: { id: string; status: string },
) => {
  if (exam.status !== "draft")
    throw new Error("Cannot modify questions on a non-draft exam");
  const attempts = await prisma.examAttempt.count({
    where: { examId: exam.id },
  });
  if (attempts > 0)
    throw new Error("Cannot modify questions on an exam that has attempts");
};

export const addQuestion = async (examId: string, formData: FormData) => {
  const session = await requireExamStaff();

  try {
    const exam = await prisma.exam.findUnique({ where: { id: examId } });
    if (!exam) throw new Error("Exam not found");

    assertExamOwnerOrAdmin(session, exam.createdById, "modify");
    await assertDraftExamMutable(exam);

    const parsed = questionFormSchema.parse(Object.fromEntries(formData));
    const grading = buildQuestionGradingFields({
      type: parsed.type,
      answer: parsed.answer,
      markingSchemeJson: parsed.markingScheme || null,
      partialCredit: parsed.partialCredit,
      manualGrading: parsed.manualGrading,
      multiSelectRule: parsed.multiSelectRule || undefined,
      wrongPenalty: parsed.wrongPenalty,
    });

    const maxOrder = await prisma.question.findFirst({
      where: { examId },
      orderBy: { order: "desc" },
      select: { order: true },
    });

    await prisma.question.create({
      data: {
        examId,
        text: parsed.text,
        type: parsed.type,
        options: parsed.options || null,
        answer: grading.answer,
        points: parsed.points,
        difficulty: parsed.difficulty ?? "medium",
        markingScheme: grading.markingScheme,
        order: (maxOrder?.order ?? -1) + 1,
      },
    });

    await refreshExamTotalMarks(examId);

    const basePath = basePathFor(session.user.role);
    revalidatePath(`${basePath}/exams/${examId}`);
  } catch (e) {
    if (e instanceof ZodError) throw new Error(zodMessage(e));
    if (e instanceof Error) throw e;
    throw new Error("Failed to add question");
  }
};

export const updateQuestion = async (id: string, formData: FormData) => {
  const session = await requireExamStaff();

  try {
    const question = await prisma.question.findUnique({
      where: { id },
      include: { exam: true },
    });
    if (!question) throw new Error("Question not found");

    assertExamOwnerOrAdmin(session, question.exam.createdById, "modify");
    await assertDraftExamMutable(question.exam);

    const parsed = questionFormSchema.parse(Object.fromEntries(formData));
    const grading = buildQuestionGradingFields({
      type: parsed.type,
      answer: parsed.answer,
      markingSchemeJson: parsed.markingScheme || null,
      partialCredit: parsed.partialCredit,
      manualGrading: parsed.manualGrading,
      multiSelectRule: parsed.multiSelectRule || undefined,
      wrongPenalty: parsed.wrongPenalty,
    });

    await prisma.question.update({
      where: { id },
      data: {
        text: parsed.text,
        type: parsed.type,
        options: parsed.options || null,
        answer: grading.answer,
        points: parsed.points,
        difficulty: parsed.difficulty ?? "medium",
        markingScheme: grading.markingScheme,
      },
    });

    await refreshExamTotalMarks(question.examId);

    const basePath = basePathFor(session.user.role);
    revalidatePath(`${basePath}/exams/${question.examId}`);
  } catch (e) {
    if (e instanceof ZodError) throw new Error(zodMessage(e));
    if (e instanceof Error) throw e;
    throw new Error("Failed to update question");
  }
};

export const deleteQuestion = async (id: string) => {
  const session = await requireExamStaff();

  try {
    const question = await prisma.question.findUnique({
      where: { id },
      include: { exam: true },
    });
    if (!question) throw new Error("Question not found");

    assertExamOwnerOrAdmin(session, question.exam.createdById, "delete");
    await assertDraftExamMutable(question.exam);

    await prisma.question.delete({ where: { id } });
    await refreshExamTotalMarks(question.examId);

    const basePath = basePathFor(session.user.role);
    revalidatePath(`${basePath}/exams/${question.examId}`);
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to delete question");
  }
};

const reorderSchema = z.object({
  examId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)).min(1),
});

/** Persist a full question order for a draft exam with no attempts. */
export const reorderExamQuestions = async (
  examId: string,
  orderedIds: string[],
) => {
  const session = await requireExamStaff();
  const parsed = reorderSchema.safeParse({ examId, orderedIds });
  if (!parsed.success) throw new Error(zodMessage(parsed.error));

  const uniqueIds = [...new Set(parsed.data.orderedIds)];
  if (uniqueIds.length !== parsed.data.orderedIds.length)
    throw new Error("Duplicate question ids in reorder list");

  try {
    const exam = await prisma.exam.findUnique({
      where: { id: parsed.data.examId },
      include: { questions: { select: { id: true } } },
    });
    if (!exam) throw new Error("Exam not found");

    assertExamOwnerOrAdmin(session, exam.createdById, "reorder");
    await assertDraftExamMutable(exam);

    const existingIds = exam.questions.map((q) => q.id).sort();
    const incoming = [...uniqueIds].sort();
    if (
      existingIds.length !== incoming.length ||
      existingIds.some((id, i) => id !== incoming[i])
    ) {
      throw new Error("Reorder list must include every question exactly once");
    }

    await prisma.$transaction(
      uniqueIds.map((id, order) =>
        prisma.question.update({ where: { id }, data: { order } }),
      ),
    );

    await refreshExamTotalMarks(parsed.data.examId);

    const basePath = basePathFor(session.user.role);
    revalidatePath(`${basePath}/exams/${parsed.data.examId}`);
    return { ok: true as const };
  } catch (e) {
    if (e instanceof Error) throw e;
    throw new Error("Failed to reorder questions");
  }
};

export const getExamPublishReadiness = async (examId: string) => {
  const session = await requireExamStaff();

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          text: true,
          type: true,
          options: true,
          answer: true,
          points: true,
        },
      },
    },
  });
  if (!exam) throw new Error("Exam not found");
  assertExamOwnerOrAdmin(session, exam.createdById, "review");

  const { evaluatePublishReadiness } = await import(
    "@/lib/exam/publishReadiness"
  );
  return evaluatePublishReadiness({
    title: exam.title,
    duration: exam.duration,
    startTime: exam.startTime,
    endTime: exam.endTime,
    passMarkPercent: exam.passMarkPercent,
    questions: exam.questions,
  });
};
