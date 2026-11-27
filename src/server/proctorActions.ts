"use server";

import "server-only";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import { withExamApiFields } from "@/lib/exam/lifecycle";
import { ActionError, runAction } from "@/server/actionResult";
import {
  assertCanManageExam,
  requireStaffSession,
} from "@/server/examAccess";

const idSchema = z.string().trim().min(1).max(64);
const assignSchema = z.object({
  examId: idSchema,
  proctorIds: z.array(idSchema).min(1).max(100),
});

const revalidateAssignPages = (examId: string) => {
  revalidatePath(`/admin/exams/${examId}/assign-proctor`);
  revalidatePath(`/examiner/exams/${examId}/assign-proctor`);
  revalidatePath("/proctor/exams");
};

/** Assign proctors; only users with the proctor role are accepted. Idempotent. */
export const assignProctor = async (examId: string, proctorIds: string[]) =>
  runAction(async () => {
    const session = await requireStaffSession("admin", "examiner");
    const parsed = assignSchema.safeParse({ examId, proctorIds });
    if (!parsed.success) throw new ActionError("Choose at least one proctor");
    const exam = await assertCanManageExam(parsed.data.examId, session);

    const ids = [...new Set(parsed.data.proctorIds)];
    const proctors = await prisma.user.findMany({
      where: { id: { in: ids }, role: "proctor" },
      select: { id: true },
    });
    if (proctors.length === 0)
      throw new ActionError("None of the selected users are proctors");

    const { count } = await prisma.examProctor.createMany({
      data: proctors.map((p) => ({
        examId: exam.id,
        proctorId: p.id,
        assignedById: session.user.id,
      })),
      skipDuplicates: true,
    });
    revalidateAssignPages(exam.id);
    return { assigned: count, skipped: ids.length - count };
  });

export const unassignProctor = async (examId: string, proctorId: string) =>
  runAction(async () => {
    const session = await requireStaffSession("admin", "examiner");
    const parsed = z.object({ examId: idSchema, proctorId: idSchema }).safeParse({
      examId,
      proctorId,
    });
    if (!parsed.success) throw new ActionError("Invalid request");
    const exam = await assertCanManageExam(parsed.data.examId, session);
    await prisma.examProctor.deleteMany({
      where: { examId: exam.id, proctorId: parsed.data.proctorId },
    });
    revalidateAssignPages(exam.id);
    return null;
  });

export const getAssignedProctors = async (examId: string) => {
  const session = await requireStaffSession("admin", "examiner");
  const exam = await assertCanManageExam(examId, session);
  return prisma.examProctor.findMany({
    where: { examId: exam.id },
    include: {
      proctor: { select: { id: true, name: true, email: true } },
    },
    orderBy: { assignedAt: "desc" },
  });
};

export const getAvailableProctors = async (examId: string) => {
  const session = await requireStaffSession("admin", "examiner");
  const exam = await assertCanManageExam(examId, session);
  const assigned = await prisma.examProctor.findMany({
    where: { examId: exam.id },
    select: { proctorId: true },
  });
  return prisma.user.findMany({
    where: {
      role: "proctor",
      banned: { not: true },
      id: { notIn: assigned.map((a) => a.proctorId) },
    },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
};

export const getProctorExams = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.role !== "proctor") redirect("/");

  try {
    const proctorAssignments = await prisma.examProctor.findMany({
      where: { proctorId: session.user.id },
      include: {
        exam: {
          include: {
            _count: {
              select: { questions: true, assignments: true, attempts: true },
            },
            createdBy: { select: { name: true } },
          },
        },
      },
      orderBy: { assignedAt: "desc" },
    });

    return proctorAssignments.map((pa) => ({
      ...withExamApiFields(pa.exam),
      proctorAssignedAt: pa.assignedAt,
    }));
  } catch {
    throw new Error("Failed to fetch proctor exams");
  }
};
