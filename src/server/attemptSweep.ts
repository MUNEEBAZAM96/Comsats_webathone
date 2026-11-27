import "server-only";

import { isAfter } from "date-fns";
import { Prisma } from "@generated/prisma/client";
import prisma from "@/lib/database/dbClient";
import { getEffectiveAttemptDeadline } from "@/lib/date/exam-time";
import {
  ensureAttemptSnapshots,
  finalizeAttemptIdempotent,
} from "@/server/attemptGrading";

const SWEEP_LIMIT = 200;

/**
 * Finalize every in-progress attempt whose server deadline has passed. Runs
 * opportunistically from staff pages and actions (no cron); never extends time.
 */
export const finalizeExpiredAttempts = async (examId?: string) => {
  // Narrow in SQL so a large number of still-running attempts cannot push
  // expired ones past the limit; the deadline is re-checked below.
  const examFilter =
    examId ? Prisma.sql`AND a."examId" = ${examId}` : Prisma.empty;
  const candidates = await prisma.$queryRaw<{ id: string }[]>`
    SELECT a."id"
    FROM "exam_attempt" a
    JOIN "exam" e ON e."id" = a."examId"
    WHERE a."status" = 'in_progress' ${examFilter}
      AND (
        a."startedAt" + make_interval(mins => e."duration") <= now()
        OR (e."endTime" IS NOT NULL AND e."endTime" <= now())
      )
    LIMIT ${SWEEP_LIMIT}`;
  if (candidates.length === 0) return { finalized: 0 };

  const attempts = await prisma.examAttempt.findMany({
    where: { id: { in: candidates.map((c) => c.id) }, status: "in_progress" },
    select: {
      id: true,
      startedAt: true,
      exam: {
        select: {
          id: true,
          duration: true,
          endTime: true,
          shuffleQuestions: true,
          shuffleOptions: true,
        },
      },
    },
  });

  const now = new Date();
  let finalized = 0;
  for (const attempt of attempts) {
    const deadline = getEffectiveAttemptDeadline(
      attempt.startedAt,
      attempt.exam.duration,
      attempt.exam.endTime,
    );
    if (!isAfter(now, deadline)) continue;
    try {
      await ensureAttemptSnapshots(attempt.id, attempt.exam);
      const result = await finalizeAttemptIdempotent(attempt.id, "server_sweep");
      if (!result.alreadySubmitted) finalized++;
    } catch (e) {
      console.error("finalizeExpiredAttempts failed", attempt.id, e);
    }
  }
  return { finalized };
};
