import { addMinutes, isAfter, isBefore, min } from "date-fns";

/**
 * Server-authoritative exam deadline helpers.
 * Never use the browser clock to *enforce* windows — only for display.
 */

export const getAttemptDurationDeadline = (
  startedAt: Date,
  durationMinutes: number,
) => addMinutes(startedAt, durationMinutes);

export const getEffectiveAttemptDeadline = (
  startedAt: Date,
  durationMinutes: number,
  examEndTime: Date | null | undefined,
) => {
  const durationDeadline = getAttemptDurationDeadline(startedAt, durationMinutes);
  return examEndTime ? min([examEndTime, durationDeadline]) : durationDeadline;
};

export const isBeforeExamStart = (now: Date, startTime: Date | null | undefined) =>
  Boolean(startTime && isBefore(now, startTime));

export const isAfterExamEnd = (now: Date, endTime: Date | null | undefined) =>
  Boolean(endTime && isAfter(now, endTime));

export const isWithinExamWindow = (
  now: Date,
  startTime: Date | null | undefined,
  endTime: Date | null | undefined,
) => {
  if (startTime && isBefore(now, startTime)) return false;
  if (endTime && isAfter(now, endTime)) return false;
  return true;
};

export const remainingMsUntil = (deadline: Date, now: Date = new Date()) =>
  Math.max(0, deadline.getTime() - now.getTime());
