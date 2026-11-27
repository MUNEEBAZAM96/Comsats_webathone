"use server";

import "server-only";

import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";

const MAX_ASSIGN_BATCH = 500;

const assignInputSchema = z.object({
  examId: z.string().min(1),
  userIds: z
    .array(z.string().min(1))
    .min(1, "Select at least one student")
    .max(MAX_ASSIGN_BATCH, `Assign at most ${MAX_ASSIGN_BATCH} students at once`),
});

const requireAssigner = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.role !== "admin" && session.user.role !== "examiner")
    redirect("/");
  return session;
};

/** Admin may manage any exam; examiners only the exams they created. */
const loadManageableExam = async (
  session: Awaited<ReturnType<typeof requireAssigner>>,
  examId: string,
) => {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { id: true, status: true, createdById: true },
  });
  if (!exam) throw new Error("Exam not found");
  if (session.user.role !== "admin" && exam.createdById !== session.user.id)
    throw new Error("You do not have permission to manage this exam");
  return exam;
};

const revalidateAssignmentPaths = (examId: string) => {
  updateTag("examiner-dashboard");
  revalidatePath(`/admin/exams/${examId}/assign`);
  revalidatePath(`/examiner/exams/${examId}/assign`);
  revalidatePath(`/admin/exams/${examId}`);
  revalidatePath(`/examiner/exams/${examId}`);
  revalidatePath("/student");
  revalidatePath("/student/exams");
};

/**
 * Assign candidates to an exam. Only active (non-banned) users with the
 * `student` role are assigned; existing assignments are skipped, so repeated
 * calls are safe.
 */
export const assignExam = async (examId: string, userIds: string[]) => {
  const session = await requireAssigner();
  const parsed = assignInputSchema.safeParse({ examId, userIds });
  if (!parsed.success)
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid assignment");

  const exam = await loadManageableExam(session, parsed.data.examId);
  if (exam.status === "completed")
    throw new Error("Cannot assign students to a completed exam");

  const requestedIds = [...new Set(parsed.data.userIds)];
  const eligible = await prisma.user.findMany({
    where: { id: { in: requestedIds }, role: "student", banned: false },
    select: { id: true },
  });
  const eligibleIds = eligible.map((u) => u.id);

  const result =
    eligibleIds.length === 0 ?
      { count: 0 }
    : await prisma.examAssignment.createMany({
        data: eligibleIds.map((userId) => ({
          examId: exam.id,
          userId,
          assignedById: session.user.id,
        })),
        skipDuplicates: true,
      });

  revalidateAssignmentPaths(exam.id);

  return {
    assigned: result.count,
    skipped: requestedIds.length - result.count,
  };
};

export const unassignExam = async (examId: string, userId: string) => {
  const session = await requireAssigner();
  const exam = await loadManageableExam(session, examId);

  const attempt = await prisma.examAttempt.findUnique({
    where: { userId_examId: { userId, examId: exam.id } },
    select: { id: true },
  });
  if (attempt)
    throw new Error(
      "This student has already started the exam and cannot be unassigned",
    );

  await prisma.examAssignment.deleteMany({
    where: { examId: exam.id, userId },
  });

  revalidateAssignmentPaths(exam.id);
};

export const getAssignedStudents = async (examId: string) => {
  const session = await requireAssigner();
  const exam = await loadManageableExam(session, examId);

  const [assignments, attempts] = await Promise.all([
    prisma.examAssignment.findMany({
      where: { examId: exam.id },
      include: {
        user: {
          select: { id: true, name: true, email: true, banned: true },
        },
      },
      orderBy: { assignedAt: "desc" },
    }),
    prisma.examAttempt.findMany({
      where: { examId: exam.id },
      select: { userId: true, status: true },
    }),
  ]);

  const attemptStatus = new Map(attempts.map((a) => [a.userId, a.status]));
  return assignments.map((a) => ({
    ...a,
    attemptStatus: attemptStatus.get(a.userId) ?? null,
  }));
};

export const getAvailableStudents = async (examId: string) => {
  const session = await requireAssigner();
  const exam = await loadManageableExam(session, examId);

  return prisma.user.findMany({
    where: {
      role: "student",
      banned: false,
      examAssignments: { none: { examId: exam.id } },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
};
