"use server";

import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import { getExamAnalytics } from "@/features/analytics/services/examAnalytics";

export const loadExamAnalytics = async (examId: string) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.role !== "admin" && session.user.role !== "examiner")
    redirect("/");

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    select: { createdById: true },
  });
  if (!exam) throw new Error("Exam not found");
  if (session.user.role === "examiner" && exam.createdById !== session.user.id)
    throw new Error("Not authorized");

  return getExamAnalytics(examId);
};
