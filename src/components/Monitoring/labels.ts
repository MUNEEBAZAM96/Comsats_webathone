export const EVENT_LABEL: Record<string, string> = {
  connection_lost: "Connection lost",
  connection_restored: "Connection restored",
  tab_hidden: "Left the exam tab",
  tab_visible: "Returned to the exam tab",
  window_blur: "Window lost focus",
  multiple_tabs: "Exam open in another tab",
  sync_conflict: "Answer conflict resolved",
  sync_failed: "Answers failed to sync",
  resumed_after_refresh: "Resumed after reload",
  auto_submitted: "Submitted automatically",
};

/** Signals summarised per candidate in the monitor table. */
export const SIGNAL_TYPES = [
  "connection_lost",
  "tab_hidden",
  "window_blur",
  "multiple_tabs",
  "sync_conflict",
  "sync_failed",
] as const;

export const SIGNAL_SHORT: Record<(typeof SIGNAL_TYPES)[number], string> = {
  connection_lost: "Offline",
  tab_hidden: "Tab",
  window_blur: "Focus",
  multiple_tabs: "Tabs",
  sync_conflict: "Conflict",
  sync_failed: "Sync",
};

export const CATEGORY_LABEL: Record<string, string> = {
  technical: "Technical",
  conduct: "Conduct",
  identity: "Identity",
  environment: "Environment",
  other: "Other",
};

export const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export const INCIDENT_STATUS_LABEL: Record<string, string> = {
  open: "Open",
  under_review: "Under review",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

export const SUBMIT_SOURCE_LABEL: Record<string, string> = {
  manual: "Submitted by candidate",
  timer: "Submitted when time ran out",
  resume_finalize: "Closed on return after the deadline",
  server_sweep: "Closed by the server after the deadline",
};

export const MONITORING_DISCLAIMER =
  "Indicators such as tab switches or connection loss are automated signals and can have innocent causes (network issues, accessibility tools, device limits). They are not proof of misconduct. Record an incident only after human review.";
