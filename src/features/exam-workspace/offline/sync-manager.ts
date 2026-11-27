"use client";

import {
  listPendingAnswers,
  markAnswerFailed,
  markAnswerSynced,
} from "./answer-storage";
import { getOfflineDb } from "./db";

/**
 * Flush pending local answers through the existing server action.
 * Server remains authoritative for ownership, attempt status, and deadlines.
 */
export const syncPendingAnswers = async (
  attemptId: string,
  saveAnswer: (
    attemptId: string,
    questionId: string,
    text: string,
  ) => Promise<void>,
) => {
  const pending = await listPendingAnswers(attemptId);
  let synced = 0;
  let failed = 0;

  for (const row of pending) {
    try {
      await saveAnswer(row.attemptId, row.questionId, row.text);
      await markAnswerSynced(row.id);
      synced++;
    } catch {
      await markAnswerFailed(row.id);
      failed++;
    }
  }

  const db = await getOfflineDb();
  await db.put("meta", {
    attemptId,
    lastOnlineAt: Date.now(),
    lastSyncAt: Date.now(),
  });

  return { synced, failed, remaining: failed };
};
