"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import { refreshExamTotalMarks } from "@/lib/exam/lifecycle";
import { QUESTION_TYPES } from "@/lib/exam/markingScheme";
import {
  findDuplicateTexts,
  parsePaperCsvRows,
  parsePaperJson,
  type NormalizedPaperQuestion,
} from "@/lib/exam/paperImport";

const questionTypeSchema = z.enum(QUESTION_TYPES);

const MAX_UPLOAD_BYTES = 1_500_000;

const requireExamStaff = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.role !== "admin" && session.user.role !== "examiner")
    redirect("/");
  return session;
};

const assertOwner = (
  session: { user: { id: string; role?: string | null } },
  createdById: string,
) => {
  if (session.user.role !== "admin" && createdById !== session.user.id)
    throw new Error("You do not have permission to modify this exam");
};

const basePathFor = (role?: string | null) =>
  role === "admin" ? "/admin" : "/examiner";

const assertDraftMutable = async (exam: { id: string; status: string }) => {
  if (exam.status !== "draft")
    throw new Error("Cannot import into a non-draft exam");
  const attempts = await prisma.examAttempt.count({
    where: { examId: exam.id },
  });
  if (attempts > 0)
    throw new Error("Cannot import into an exam that has attempts");
};

const previewSchema = z.object({
  examId: z.string().min(1),
  format: z.enum(["csv", "json"]),
  content: z.string().min(1).max(MAX_UPLOAD_BYTES),
});

export const previewPaperUpload = async (input: {
  examId: string;
  format: "csv" | "json";
  content: string;
}) => {
  const session = await requireExamStaff();
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid upload payload");

  const exam = await prisma.exam.findUnique({
    where: { id: parsed.data.examId },
    include: { questions: { select: { text: true } } },
  });
  if (!exam) throw new Error("Exam not found");
  assertOwner(session, exam.createdById);
  await assertDraftMutable(exam);

  if (Buffer.byteLength(parsed.data.content, "utf8") > MAX_UPLOAD_BYTES)
    throw new Error("File is too large (max 1.5 MB)");

  let result;
  if (parsed.data.format === "json") {
    let json: unknown;
    try {
      json = JSON.parse(parsed.data.content);
    } catch {
      throw new Error("Invalid JSON file");
    }
    result = parsePaperJson(json);
  } else {
    const Papa = (await import("papaparse")).default;
    const parsedCsv = Papa.parse<Record<string, unknown>>(parsed.data.content, {
      header: true,
      skipEmptyLines: true,
    });
    if (parsedCsv.errors.length > 0) {
      throw new Error(
        `CSV parse error on row ${parsedCsv.errors[0]?.row ?? "?"}: ${parsedCsv.errors[0]?.message}`,
      );
    }
    result = parsePaperCsvRows(parsedCsv.data);
  }

  const duplicates = findDuplicateTexts(
    result.questions,
    exam.questions.map((q) => q.text),
  );

  return {
    title: result.title,
    questions: result.questions,
    issues: result.issues,
    duplicates,
    canImport: result.issues.length === 0 && result.questions.length > 0,
  };
};

const commitSchema = z.object({
  examId: z.string().min(1),
  questions: z
    .array(
      z.object({
        section: z.string(),
        text: z.string().min(1),
        type: questionTypeSchema,
        options: z.string().nullable(),
        answer: z.string(),
        points: z.number().int().min(1),
        difficulty: z.enum(["easy", "medium", "hard"]),
        markingScheme: z.string().nullable(),
      }),
    )
    .min(1)
    .max(500),
});

const ensureSections = async (
  examId: string,
  questions: NormalizedPaperQuestion[],
) => {
  const titles = [
    ...new Set(questions.map((q) => q.section.trim()).filter(Boolean)),
  ];
  const existing = await prisma.examSection.findMany({ where: { examId } });
  const byTitle = new Map(
    existing.map((s) => [s.title.trim().toLowerCase(), s]),
  );
  let order =
    existing.reduce((max, s) => Math.max(max, s.order), -1) + 1;

  for (const title of titles) {
    const key = title.toLowerCase();
    if (byTitle.has(key)) continue;
    const created = await prisma.examSection.create({
      data: { examId, title, order },
    });
    byTitle.set(key, created);
    order += 1;
  }
  return byTitle;
};

export const commitPaperUpload = async (input: {
  examId: string;
  questions: NormalizedPaperQuestion[];
}) => {
  const session = await requireExamStaff();
  const parsed = commitSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid import payload");

  const exam = await prisma.exam.findUnique({
    where: { id: parsed.data.examId },
    include: { questions: { select: { text: true, order: true } } },
  });
  if (!exam) throw new Error("Exam not found");
  assertOwner(session, exam.createdById);
  await assertDraftMutable(exam);

  const duplicates = findDuplicateTexts(
    parsed.data.questions,
    exam.questions.map((q) => q.text),
  );
  if (duplicates.length > 0)
    throw new Error(
      `Duplicate questions blocked: ${duplicates.slice(0, 3).join("; ")}`,
    );

  if (parsed.data.questions.some((q) => !q.text.trim() || q.points < 1))
    throw new Error("Every imported question needs text and positive marks");

  const sectionMap = await ensureSections(
    parsed.data.examId,
    parsed.data.questions,
  );
  let nextOrder =
    exam.questions.reduce((max, q) => Math.max(max, q.order), -1) + 1;

  await prisma.$transaction(async (tx) => {
    for (const q of parsed.data.questions) {
      const section =
        q.section.trim() ?
          sectionMap.get(q.section.trim().toLowerCase())
        : undefined;
      await tx.question.create({
        data: {
          examId: parsed.data.examId,
          text: q.text,
          type: q.type,
          options: q.options,
          answer: q.answer,
          points: q.points,
          difficulty: q.difficulty,
          markingScheme: q.markingScheme,
          sectionId: section?.id ?? null,
          order: nextOrder,
        },
      });
      nextOrder += 1;
    }
  });

  await refreshExamTotalMarks(parsed.data.examId);
  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${parsed.data.examId}`,
  );
  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${parsed.data.examId}/builder`,
  );
  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${parsed.data.examId}/preview`,
  );

  return { imported: parsed.data.questions.length };
};

/** Soft restore of a removed draft question (client holds the snapshot briefly). */
export const restoreExamQuestion = async (input: {
  examId: string;
  question: {
    text: string;
    type: string;
    options: string | null;
    answer: string | null;
    points: number;
    difficulty?: string | null;
    markingScheme?: string | null;
    sectionId?: string | null;
  };
}) => {
  const session = await requireExamStaff();
  const exam = await prisma.exam.findUnique({ where: { id: input.examId } });
  if (!exam) throw new Error("Exam not found");
  assertOwner(session, exam.createdById);
  await assertDraftMutable(exam);

  const maxOrder = await prisma.question.findFirst({
    where: { examId: input.examId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  await prisma.question.create({
    data: {
      examId: input.examId,
      text: input.question.text,
      type: input.question.type,
      options: input.question.options,
      answer: input.question.answer,
      points: input.question.points,
      difficulty: input.question.difficulty ?? "medium",
      markingScheme: input.question.markingScheme ?? null,
      sectionId: input.question.sectionId ?? null,
      order: (maxOrder?.order ?? -1) + 1,
    },
  });

  await refreshExamTotalMarks(input.examId);
  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${input.examId}`,
  );
  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${input.examId}/builder`,
  );
};
