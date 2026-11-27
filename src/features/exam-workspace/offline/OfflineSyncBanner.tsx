"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOnlineStatus } from "./connectivity";
import { listPendingAnswers } from "./answer-storage";
import { syncPendingAnswers } from "./sync-manager";

type Props = {
  attemptId: string;
  saveAnswer: (
    attemptId: string,
    questionId: string,
    text: string,
  ) => Promise<void>;
};

export const OfflineSyncBanner = ({ attemptId, saveAnswer }: Props) => {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(0);
  const [syncLabel, setSyncLabel] = useState<string | null>(null);
  const syncingRef = useRef(false);
  const saveAnswerRef = useRef(saveAnswer);

  useEffect(() => {
    saveAnswerRef.current = saveAnswer;
  }, [saveAnswer]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void listPendingAnswers(attemptId).then((rows) => {
        if (!cancelled) setPending(rows.length);
      });
    };
    const id = window.setInterval(tick, 4000);
    tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [attemptId]);

  const runSync = useCallback(async () => {
    if (!online || syncingRef.current) return;
    syncingRef.current = true;
    setSyncLabel("Syncing pending answers…");
    try {
      const result = await syncPendingAnswers(attemptId, (...args) =>
        saveAnswerRef.current(...args),
      );
      const rows = await listPendingAnswers(attemptId);
      setPending(rows.length);
      setSyncLabel(
        result.failed > 0 ?
          `${result.failed} answer(s) failed to sync`
        : null,
      );
    } finally {
      syncingRef.current = false;
    }
  }, [online, attemptId]);

  useEffect(() => {
    if (online && pending > 0) void runSync();
  }, [online, pending, runSync]);

  if (online && pending === 0 && !syncLabel) return null;

  return (
    <div
      className="border-border bg-card text-muted-foreground rounded-md border px-3 py-2 text-xs"
      role="status">
      {!online ?
        "You are offline. Answers are saved locally and will sync when connectivity returns."
      : syncLabel ?
        syncLabel
      : `${pending} answer(s) waiting to sync.`}
    </div>
  );
};
