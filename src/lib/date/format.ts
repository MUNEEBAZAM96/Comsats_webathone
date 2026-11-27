import { format, formatDistanceStrict, type Locale } from "date-fns";

/** Display dates in a consistent institutional style (local timezone of the viewer). */
export const formatDisplayDate = (date: Date | string | number) =>
  format(new Date(date), "MMM d, yyyy");

export const formatDisplayDateTime = (date: Date | string | number) =>
  format(new Date(date), "MMM d, yyyy, h:mm a");

export const formatIsoUtc = (date: Date | string | number) =>
  new Date(date).toISOString();

export const formatDurationMinutes = (minutes: number) => {
  if (!Number.isFinite(minutes) || minutes < 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h <= 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};

export const formatRemaining = (
  deadline: Date,
  now: Date = new Date(),
  locale?: Locale,
) => {
  if (deadline.getTime() <= now.getTime()) return "0s";
  return formatDistanceStrict(deadline, now, { locale, roundingMethod: "floor" });
};
