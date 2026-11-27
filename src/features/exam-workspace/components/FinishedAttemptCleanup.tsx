"use client";

import { useEffect } from "react";
import {
  clearAttemptAnswers,
  listPendingAnswers,
} from "../offline/answer-storage";
import { clearOfflineRecovery } from "../offline/recovery";
import { clearReviewFlags } from "../reviewFlags";
import { clearScratchpad } from "@/features/scratchpad/services/scratchpadDb";
import { toast } from "sonner";

export const FinishedAttemptCleanup = ({
  attemptId,
}: {
  attemptId: string;
}) => {
  useEffect(() => {
    let active = true;
    void listPendingAnswers(attemptId)
      .then(async (answers) => {
        if (!active) return;
        if (answers.length)
          toast.warning(
            "Some local answers did not reach the server before the attempt ended.",
          );
        await clearAttemptAnswers(attemptId);
      })
      .catch(() => undefined);
    void clearScratchpad(attemptId).catch(() => undefined);
    clearReviewFlags(attemptId);
    clearOfflineRecovery(attemptId);
    return () => {
      active = false;
    };
  }, [attemptId]);
  return null;
};
