export type SyncStatus = "pending" | "synced" | "failed";

export type LocalAnswer = {
  /** `${attemptId}:${questionId}` */
  id: string;
  attemptId: string;
  questionId: string;
  text: string;
  updatedAt: number;
  syncStatus: SyncStatus;
  /** Unique per write; the server treats a repeated (seq, key) as a no-op. */
  idempotencyKey: string;
  /** Monotonic per (attempt, question); higher always wins on the server. */
  clientSeq: number;
  /** Highest sequence the server has acknowledged for this question. */
  ackSeq: number;
  /** Failed send attempts for the current sequence. */
  attempts: number;
  lastError: string | null;
  nextRetryAt: number | null;
};

export type LocalEvent = {
  id: string;
  attemptId: string;
  type: string;
  detail?: Record<string, string | number | boolean>;
  clientAt: number;
};

export type OfflineMeta = {
  attemptId: string;
  lastOnlineAt: number | null;
  lastSyncAt: number | null;
  /** Display only — never used to decide eligibility or deadlines. */
  lastServerNow?: string | null;
  lastRemainingMs?: number | null;
};
