"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import {
  evaluateBlueprint,
  examBlueprintSchema,
  parseExamBlueprint,
} from "@/lib/exam/blueprint";

const requireExamStaff = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.role !== "admin" && session.user.role !== "examiner")
    redirect("/");
  return session;
};

export const saveExamBlueprint = async (
  examId: string,
  blueprint: unknown | null,
) => {
  const session = await requireExamStaff();
  const exam = await prisma.exam.findUnique({ where: { id: examId } });
  if (!exam) throw new Error("Exam not found");
  if (session.user.role !== "admin" && exam.createdById !== session.user.id)
    throw new Error("You do not have permission to modify this exam");
  if (exam.status !== "draft")
    throw new Error("Blueprint can only be edited on draft exams");

  let blueprintJson: string | null = null;
  if (blueprint != null) {
    const parsed = examBlueprintSchema.safeParse(blueprint);
    if (!parsed.success) throw new Error("Invalid blueprint");
    blueprintJson = JSON.stringify(parsed.data);
  }

  await prisma.exam.update({
    where: { id: examId },
    data: { blueprintJson },
  });

  const base = session.user.role === "admin" ? "/admin" : "/examiner";
  revalidatePath(`${base}/exams/${examId}`);
  revalidatePath(`${base}/exams/${examId}/builder`);
  return { ok: true as const };
};

export const getExamBlueprintWarnings = async (examId: string) => {
  const session = await requireExamStaff();
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: {
        select: { type: true, difficulty: true, points: true },
      },
    },
  });
  if (!exam) throw new Error("Exam not found");
  if (session.user.role !== "admin" && exam.createdById !== session.user.id)
    throw new Error("You do not have permission to view this exam");
  const blueprint = parseExamBlueprint(exam.blueprintJson);
  return evaluateBlueprint(blueprint, exam.questions);
};
