"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z, ZodError } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";

const zodMessage = (e: ZodError) =>
  e.issues.map((i) => i.message).join("; ");

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

const assertDraftMutable = async (exam: {
  id: string;
  status: string;
  createdById: string;
}) => {
  if (exam.status !== "draft")
    throw new Error("Cannot modify sections on a non-draft exam");
  const attempts = await prisma.examAttempt.count({ where: { examId: exam.id } });
  if (attempts > 0)
    throw new Error("Cannot modify sections on an exam that has attempts");
};

const sectionSchema = z.object({
  title: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(5000).optional().or(z.literal("")),
});

export const createExamSection = async (
  examId: string,
  input: { title: string; instructions?: string },
) => {
  const session = await requireExamStaff();
  const parsed = sectionSchema.parse(input);
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw new Error("Exam not found");
  assertOwner(session, exam.createdById);
  await assertDraftMutable(exam);

  const maxOrder = await prisma.examSection.findFirst({
    where: { examId },
    orderBy: { order: "desc" },
    select: { order: true },
  });

  const section = await prisma.examSection.create({
    data: {
      examId,
      title: parsed.title,
      instructions: parsed.instructions || null,
      order: (maxOrder?.order ?? -1) + 1,
    },
  });

  revalidatePath(`${basePathFor(session.user.role)}/exams/${examId}`);
  revalidatePath(`${basePathFor(session.user.role)}/exams/${examId}/builder`);
  return section;
};

export const updateExamSection = async (
  sectionId: string,
  input: { title: string; instructions?: string },
) => {
  const session = await requireExamStaff();
  const parsed = sectionSchema.parse(input);
  const section = await prisma.examSection.findUnique({
    where: { id: sectionId },
    include: { exam: true },
  });
  if (!section) throw new Error("Section not found");
  assertOwner(session, section.exam.createdById);
  await assertDraftMutable(section.exam);

  await prisma.examSection.update({
    where: { id: sectionId },
    data: {
      title: parsed.title,
      instructions: parsed.instructions || null,
    },
  });

  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${section.examId}`,
  );
  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${section.examId}/builder`,
  );
};

export const deleteExamSection = async (sectionId: string) => {
  const session = await requireExamStaff();
  const section = await prisma.examSection.findUnique({
    where: { id: sectionId },
    include: { exam: true },
  });
  if (!section) throw new Error("Section not found");
  assertOwner(session, section.exam.createdById);
  await assertDraftMutable(section.exam);

  await prisma.$transaction([
    prisma.question.updateMany({
      where: { sectionId },
      data: { sectionId: null },
    }),
    prisma.examSection.delete({ where: { id: sectionId } }),
  ]);

  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${section.examId}`,
  );
  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${section.examId}/builder`,
  );
};

export const assignQuestionSection = async (
  questionId: string,
  sectionId: string | null,
) => {
  const session = await requireExamStaff();
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { exam: true },
  });
  if (!question) throw new Error("Question not found");
  assertOwner(session, question.exam.createdById);
  await assertDraftMutable(question.exam);

  if (sectionId) {
    const section = await prisma.examSection.findFirst({
      where: { id: sectionId, examId: question.examId },
    });
    if (!section) throw new Error("Section not found on this exam");
  }

  await prisma.question.update({
    where: { id: questionId },
    data: { sectionId },
  });

  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${question.examId}`,
  );
  revalidatePath(
    `${basePathFor(session.user.role)}/exams/${question.examId}/builder`,
  );
};

const reorderSectionsSchema = z.object({
  examId: z.string().min(1),
  orderedIds: z.array(z.string().min(1)),
});

export const reorderExamSections = async (
  examId: string,
  orderedIds: string[],
) => {
  const session = await requireExamStaff();
  const parsed = reorderSectionsSchema.safeParse({ examId, orderedIds });
  if (!parsed.success) throw new Error(zodMessage(parsed.error));

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: { sections: { select: { id: true } } },
  });
  if (!exam) throw new Error("Exam not found");
  assertOwner(session, exam.createdById);
  await assertDraftMutable(exam);

  const existing = exam.sections.map((s) => s.id).sort();
  const incoming = [...new Set(parsed.data.orderedIds)].sort();
  if (
    existing.length !== incoming.length ||
    existing.some((id, i) => id !== incoming[i])
  ) {
    throw new Error("Reorder list must include every section exactly once");
  }

  await prisma.$transaction(
    parsed.data.orderedIds.map((id, order) =>
      prisma.examSection.update({ where: { id }, data: { order } }),
    ),
  );

  revalidatePath(`${basePathFor(session.user.role)}/exams/${examId}`);
  revalidatePath(`${basePathFor(session.user.role)}/exams/${examId}/builder`);
};
