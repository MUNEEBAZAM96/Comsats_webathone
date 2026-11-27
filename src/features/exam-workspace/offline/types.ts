export type SyncStatus = "pending" | "synced" | "failed";

export type LocalAnswer = {
  id: string;
  attemptId: string;
  questionId: string;
  text: string;
  updatedAt: number;
  syncStatus: SyncStatus;
  idempotencyKey: string;
};

export type OfflineMeta = {
  attemptId: string;
  lastOnlineAt: number | null;
  lastSyncAt: number | null;
};
