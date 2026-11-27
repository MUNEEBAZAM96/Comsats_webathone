"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import prisma from "@/lib/database/dbClient";
import { syncExamLifecycle, withExamApiFields } from "@/lib/exam/lifecycle";

/**
 * Candidate-safe preview payload for staff. Answer keys and marking schemes
 * are intentionally omitted.
 */
export const getExamCandidatePreview = async (examId: string) => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/");
  if (session.user.role !== "admin" && session.user.role !== "examiner")
    redirect("/");

  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      sections: { orderBy: { order: "asc" } },
      questions: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          text: true,
          type: true,
          options: true,
          points: true,
          order: true,
          difficulty: true,
          sectionId: true,
          section: {
            select: { id: true, title: true, instructions: true, order: true },
          },
        },
      },
      createdBy: { select: { name: true } },
    },
  });

  if (!exam) {
    if (session.user.role === "admin") redirect("/admin/exams");
    redirect("/examiner/exams");
  }

  if (session.user.role === "examiner" && exam.createdById !== session.user.id)
    redirect("/examiner/exams");

  const now = new Date();
  const synced = await syncExamLifecycle(exam, now);
  const api = withExamApiFields(synced, now);

  return {
    id: api.id,
    title: api.title,
    description: api.description,
    instructions: api.instructions,
    duration: api.duration,
    startTime: api.startTime,
    endTime: api.endTime,
    status: api.status,
    totalMarks: api.totalMarks,
    shuffleQuestions: api.shuffleQuestions,
    shuffleOptions: api.shuffleOptions,
    resultReveal: api.resultReveal,
    passMarkPercent: api.passMarkPercent,
    createdBy: exam.createdBy,
    sections: exam.sections,
    questions: exam.questions.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      options: q.options,
      points: q.points,
      order: q.order,
      difficulty: q.difficulty,
      sectionId: q.sectionId,
      section: q.section,
    })),
  };
};
