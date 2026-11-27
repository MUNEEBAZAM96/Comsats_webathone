import {
  MAX_SYNC_BATCH,
  type SaveAnswerItem,
  type SaveAnswersFailure,
  type SaveAnswersResult,
} from "@/lib/exam/syncSchemas";
import {
  applyServerCopy,
  markAnswerFailed,
  markAnswerSynced,
  upsertLocalAnswer,
} from "./answer-storage";

export type SyncState =
  | "restoring"
  | "synced"
  | "pending"
  | "saving"
  | "offline"
  | "retrying"
  | "error"
  | "closed";

export type SyncSnapshot = {
  state: SyncState;
  pendingCount: number;
  pendingQuestionIds: readonly string[];
  lastSyncedAt: number | null;
  nextRetryAt: number | null;
  failures: number;
  closedReason: SaveAnswersFailure | null;
  /** False when IndexedDB is unavailable and answers live in memory only. */
  storageAvailable: boolean;
};

/** Persistence used by the queue; the default is IndexedDB. */
export type AnswerStorage = {
  upsert: (
    attemptId: string,
    questionId: string,
    text: string,
  ) => Promise<{ clientSeq: number; idempotencyKey: string }>;
  markSynced: (attemptId: string, questionId: string, seq: number) => Promise<void>;
  markFailed: (
    attemptId: string,
    questionId: string,
    seq: number,
    error: string,
    nextRetryAt: number | null,
  ) => Promise<void>;
  applyServerCopy: (
    attemptId: string,
    questionId: string,
    text: string,
    seq: number,
  ) => Promise<void>;
};

export const indexedDbAnswerStorage: AnswerStorage = {
  upsert: (attemptId, questionId, text) =>
    upsertLocalAnswer({ attemptId, questionId, text }),
  markSynced: markAnswerSynced,
  markFailed: markAnswerFailed,
  applyServerCopy,
};

export type QueueOptions = {
  attemptId: string;
  send: (items: SaveAnswerItem[]) => Promise<SaveAnswersResult>;
  storage?: AnswerStorage;
  /** Whether the device reports a network connection (navigator.onLine). */
  isOnline?: () => boolean;
  /** Server kept a newer copy; the UI should show it and tell the student. */
  onStale?: (info: { questionId: string; text: string; serverSeq: number }) => void;
  /** Server will accept no more writes (deadline, submitted, signed out). */
  onClosed?: (reason: SaveAnswersFailure, message: string) => void;
  onNetworkResult?: (ok: boolean) => void;
  /** Report "restoring" (never "synced") until `prime` has run. */
  awaitPrime?: boolean;
  debounceMs?: number;
  now?: () => number;
  random?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

/** 1s, 2s, 4s, 8s, 16s, then 30s, each with ±20% jitter. */
export const backoffDelay = (failures: number, random: () => number = Math.random) => {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, failures - 1));
  return Math.round(base * (0.8 + random() * 0.4));
};

/** Consecutive failures after which the indicator asks for attention. */
const ERROR_AFTER_FAILURES = 3;

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Network error";

const randomKey = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ?
    crypto.randomUUID()
  : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export const createAnswerSyncQueue = (options: QueueOptions) => {
  const {
    attemptId,
    send,
    storage = indexedDbAnswerStorage,
    isOnline = () => typeof navigator === "undefined" || navigator.onLine,
    onNetworkResult,
    debounceMs = 400,
    now = Date.now,
    random = Math.random,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  } = options;
  let { onStale, onClosed } = options;

  /** Latest unsent (or unacknowledged) write per question. */
  const pending = new Map<string, SaveAnswerItem>();
  /** Highest sequence handed out or acknowledged per question. */
  const seqFloor = new Map<string, number>();
  /** Last text recorded per question, to skip no-op edits. */
  const lastText = new Map<string, string>();
  const listeners = new Set<() => void>();

  let writeChain: Promise<unknown> = Promise.resolve();
  let inFlight: Promise<void> | null = null;
  let timer: unknown = null;
  let failures = 0;
  let fatal = false;
  let lastSyncedAt: number | null = null;
  let nextRetryAt: number | null = null;
  let closedReason: SaveAnswersFailure | null = null;
  let storageAvailable = true;
  let stopped = false;
  let primed = !options.awaitPrime;

  const compute = (): SyncSnapshot => {
    let state: SyncState;
    if (closedReason) state = "closed";
    else if (inFlight) state = "saving";
    else if (!primed) state = "restoring";
    else if (pending.size === 0) state = "synced";
    else if (!isOnline()) state = "offline";
    else if (fatal || failures >= ERROR_AFTER_FAILURES) state = "error";
    else if (failures > 0) state = "retrying";
    else state = "pending";
    return {
      state,
      pendingCount: pending.size,
      pendingQuestionIds: [...pending.keys()].sort(),
      lastSyncedAt,
      nextRetryAt,
      failures,
      closedReason,
      storageAvailable,
    };
  };

  let snapshot = compute();
  const emit = () => {
    snapshot = compute();
    for (const listener of listeners) listener();
  };

  const cancelTimer = () => {
    if (timer !== null) clearTimer(timer);
    timer = null;
  };

  const schedule = (ms: number) => {
    if (stopped || closedReason) return;
    cancelTimer();
    timer = setTimer(() => {
      timer = null;
      void flush();
    }, ms);
  };

  const run = async () => {
    if (!isOnline()) return;
    const batch = [...pending.values()].slice(0, MAX_SYNC_BATCH);
    if (batch.length === 0) return;

    let res: SaveAnswersResult;
    try {
      res = await send(batch);
      onNetworkResult?.(true);
    } catch (error) {
      onNetworkResult?.(false);
      failures++;
      const delay = backoffDelay(failures, random);
      nextRetryAt = now() + delay;
      await Promise.all(
        batch.map((item) =>
          storage
            .markFailed(attemptId, item.questionId, item.clientSeq, errorMessage(error), nextRetryAt)
            .catch(() => undefined),
        ),
      );
      schedule(delay);
      return;
    }

    if (!res.ok) {
      if (res.reason === "invalid") {
        // Retrying the same payload cannot succeed; wait for "Retry now".
        fatal = true;
        failures++;
        nextRetryAt = null;
        return;
      }
      closedReason = res.reason;
      nextRetryAt = null;
      cancelTimer();
      onClosed?.(res.reason, res.message);
      return;
    }

    failures = 0;
    fatal = false;
    nextRetryAt = null;
    lastSyncedAt = now();

    for (const result of res.results) {
      const { questionId, serverSeq } = result;
      const current = pending.get(questionId);
      seqFloor.set(questionId, Math.max(seqFloor.get(questionId) ?? 0, serverSeq));

      if (result.status === "saved" || result.status === "duplicate") {
        if (current && current.clientSeq <= serverSeq) pending.delete(questionId);
        await storage.markSynced(attemptId, questionId, serverSeq).catch(() => undefined);
      } else if (result.status === "stale") {
        // A newer local edit queued meanwhile outranks the server copy.
        if (current && current.clientSeq > serverSeq) continue;
        pending.delete(questionId);
        const text = result.serverText ?? "";
        lastText.set(questionId, text);
        await storage
          .applyServerCopy(attemptId, questionId, text, serverSeq)
          .catch(() => undefined);
        onStale?.({ questionId, text, serverSeq });
      } else {
        const sent = batch.find((b) => b.questionId === questionId);
        if (current && sent && current.clientSeq === sent.clientSeq)
          pending.delete(questionId);
      }
    }
  };

  const flush = (): Promise<void> => {
    if (inFlight) return inFlight;
    if (stopped || closedReason || pending.size === 0) return Promise.resolve();
    if (!isOnline()) {
      emit();
      return Promise.resolve();
    }
    cancelTimer();
    const current = run().finally(() => {
      inFlight = null;
      emit();
      if (pending.size > 0 && failures === 0 && !fatal && !closedReason) schedule(0);
    });
    inFlight = current;
    emit();
    return current;
  };

  /** Record an edit locally and schedule a sync. */
  const enqueue = (questionId: string, text: string): Promise<void> => {
    if (stopped || closedReason) return Promise.resolve();
    if (lastText.get(questionId) === text) return Promise.resolve();
    lastText.set(questionId, text);

    const op = writeChain.then(async () => {
      let clientSeq: number;
      let idempotencyKey: string;
      try {
        const row = await storage.upsert(attemptId, questionId, text);
        storageAvailable = true;
        clientSeq = row.clientSeq;
        idempotencyKey = row.idempotencyKey;
      } catch {
        storageAvailable = false;
        clientSeq = 0;
        idempotencyKey = randomKey();
      }
      const floor = seqFloor.get(questionId) ?? 0;
      if (clientSeq <= floor) {
        clientSeq = floor + 1;
        idempotencyKey = randomKey();
      }
      seqFloor.set(questionId, clientSeq);
      pending.set(questionId, { questionId, text, clientSeq, idempotencyKey });
      emit();
      if (failures === 0) schedule(debounceMs);
    });
    writeChain = op.catch(() => undefined);
    return op;
  };

  /**
   * Prime the queue after load: server rows set the sequence floor, and local
   * rows newer than the server are queued again with their original key.
   */
  const prime = (input: {
    server: { questionId: string; clientSeq: number; text: string | null }[];
    recovered?: { questionId: string; text: string; clientSeq: number; idempotencyKey: string }[];
  }) => {
    for (const row of input.server) {
      const floor = seqFloor.get(row.questionId) ?? 0;
      if (row.clientSeq >= floor && !pending.has(row.questionId))
        lastText.set(row.questionId, row.text ?? "");
      seqFloor.set(row.questionId, Math.max(floor, row.clientSeq));
    }
    const accepted: { questionId: string; text: string }[] = [];
    for (const row of input.recovered ?? []) {
      const floor = seqFloor.get(row.questionId) ?? 0;
      // Edits made since load already outrank the recovered copy.
      if (row.clientSeq <= floor || pending.has(row.questionId)) continue;
      seqFloor.set(row.questionId, row.clientSeq);
      lastText.set(row.questionId, row.text);
      pending.set(row.questionId, {
        questionId: row.questionId,
        text: row.text,
        clientSeq: row.clientSeq,
        idempotencyKey: row.idempotencyKey,
      });
      accepted.push({ questionId: row.questionId, text: row.text });
    }
    primed = true;
    emit();
    return accepted;
  };

  /** Skip the backoff wait (online event, tab visible, "Retry now"). */
  const retryNow = () => {
    fatal = false;
    nextRetryAt = null;
    cancelTimer();
    return flush();
  };

  /**
   * Try to drain everything before submit. Resolves true only when every
   * queued answer has been acknowledged.
   */
  const flushAll = async (maxRounds = 6) => {
    await writeChain;
    for (let round = 0; round < maxRounds && pending.size > 0 && !closedReason; round++) {
      if (!isOnline()) break;
      const before = failures;
      fatal = false;
      cancelTimer();
      await (inFlight ?? flush());
      if (failures > before || fatal) break;
    }
    return pending.size === 0;
  };

  return {
    enqueue,
    flush,
    flushAll,
    retryNow,
    prime,
    /** Re-evaluate state after a connectivity change; reconnecting retries at once. */
    notifyConnectivity: () => {
      emit();
      if (isOnline() && pending.size > 0) void retryNow();
    },
    /** Every unacknowledged write, for submit's `finalItems`. */
    getPendingItems: () => [...pending.values()],
    /** Replace the stale/closed callbacks (the UI rebinds them after render). */
    setHandlers: (handlers: Pick<QueueOptions, "onStale" | "onClosed">) => {
      onStale = handlers.onStale;
      onClosed = handlers.onClosed;
    },
    whenIdle: () => writeChain,
    hasPending: (questionId: string) => pending.has(questionId),
    markClosed: (reason: SaveAnswersFailure) => {
      closedReason = reason;
      cancelTimer();
      emit();
    },
    /** Resume after the student signs in again; other closures are final. */
    reopen: () => {
      if (closedReason !== "unauthorized") return;
      closedReason = null;
      failures = 0;
      emit();
      void flush();
    },
    /** Pause timers (unmount). `start` resumes; queued answers are kept. */
    stop: () => {
      stopped = true;
      cancelTimer();
    },
    start: () => {
      stopped = false;
      if (pending.size > 0 && failures === 0) schedule(0);
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => snapshot,
  };
};

export type AnswerSyncQueue = ReturnType<typeof createAnswerSyncQueue>;
