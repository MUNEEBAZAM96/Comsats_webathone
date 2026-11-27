import { z } from "zod";

/** Maximum characters in one answer (matches the workspace textarea limit). */
export const MAX_ANSWER_CHARS = 50_000;
export const MAX_SYNC_BATCH = 50;
/** Unsynced answers a submit may carry (one per question at most). */
export const MAX_FINAL_ITEMS = 200;
export const MAX_EVENTS_PER_CALL = 20;
export const MAX_EVENTS_PER_ATTEMPT = 200;

export const ATTEMPT_EVENT_TYPES = [
  "connection_lost",
  "connection_restored",
  "tab_hidden",
  "tab_visible",
  "window_blur",
  "multiple_tabs",
  "sync_conflict",
  "sync_failed",
  "resumed_after_refresh",
  "auto_submitted",
] as const;
export type AttemptEventType = (typeof ATTEMPT_EVENT_TYPES)[number];

/** Event types a client may report. `auto_submitted` is written by the server. */
export const CLIENT_EVENT_TYPES = ATTEMPT_EVENT_TYPES.filter(
  (t) => t !== "auto_submitted",
) as Exclude<AttemptEventType, "auto_submitted">[];

const idSchema = z.string().trim().min(1).max(64);
export const attemptIdSchema = idSchema;

export const saveAnswerItemSchema = z.object({
  questionId: idSchema,
  text: z.string().max(MAX_ANSWER_CHARS, "Answer exceeds maximum length"),
  clientSeq: z.number().int().min(1).max(2_147_483_647),
  idempotencyKey: z.string().min(8).max(64),
});
export type SaveAnswerItem = z.infer<typeof saveAnswerItemSchema>;

export const saveAnswersSchema = z.object({
  attemptId: idSchema,
  items: z.array(saveAnswerItemSchema).min(1).max(MAX_SYNC_BATCH),
});

export type SaveAnswerItemResult = {
  questionId: string;
  status: "saved" | "duplicate" | "stale" | "invalid";
  serverSeq: number;
  /** Present only for `stale`: the newer copy the server already holds. */
  serverText?: string;
};

export type SaveAnswersFailure =
  | "deadline_passed"
  | "already_submitted"
  | "unauthorized"
  | "invalid";

export type SaveAnswersResult =
  | { ok: true; serverTime: string; results: SaveAnswerItemResult[] }
  | { ok: false; reason: SaveAnswersFailure; message: string };

const detailValue = z.union([
  z.string().max(200),
  z.number().finite(),
  z.boolean(),
]);

export const attemptEventInputSchema = z.object({
  type: z.enum(CLIENT_EVENT_TYPES as [string, ...string[]]),
  detail: z.record(z.string().max(40), detailValue).optional(),
  /** Client clock, informational only — never used for ordering or rules. */
  clientAt: z.number().int().optional(),
});
export type AttemptEventInput = z.infer<typeof attemptEventInputSchema>;

export const recordEventsSchema = z.object({
  attemptId: idSchema,
  events: z.array(attemptEventInputSchema).min(1).max(MAX_EVENTS_PER_CALL),
});

export const heartbeatSchema = z.object({
  attemptId: idSchema,
  online: z.boolean(),
  pendingLocal: z.number().int().min(0).max(10_000),
  visible: z.boolean(),
});

export const submitOptionsSchema = z.object({
  source: z.enum(["manual", "timer"]).default("manual"),
  finalItems: z.array(saveAnswerItemSchema).max(MAX_FINAL_ITEMS).optional(),
});
export type SubmitOptions = z.input<typeof submitOptionsSchema>;

export type StudentAnnouncement = {
  id: string;
  message: string;
  priority: "info" | "important" | "urgent";
  createdAt: string;
  read: boolean;
};

export type HeartbeatResult =
  | {
      ok: true;
      status: string;
      remainingMs: number;
      deadline: string;
      serverNow: string;
      announcements: StudentAnnouncement[];
    }
  | { ok: false; reason: "unauthorized" | "invalid"; message: string };
