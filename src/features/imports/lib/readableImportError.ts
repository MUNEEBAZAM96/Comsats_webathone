/** Map thrown/network errors to safe user-facing import messages. */
export const getReadableImportError = (error: unknown): string => {
  const raw =
    error instanceof Error ? error.message
    : typeof error === "string" ? error
    : "";
  const message = raw.toLowerCase();

  if (
    message.includes("2 mb") ||
    message.includes("2mb") ||
    message.includes("exceeds the 2") ||
    message.includes("file exceeds")
  ) {
    return "The file exceeds the 2 MB limit.";
  }
  if (
    message.includes("body") &&
    (message.includes("too large") ||
      message.includes("limit") ||
      message.includes("413") ||
      message.includes("payload"))
  ) {
    return "The upload request is too large. Keep the file under 2 MB.";
  }
  if (
    message.includes("malformed csv") ||
    message.includes("quoting") ||
    message.includes("parse") ||
    message.includes("unexpected quote")
  ) {
    return "The CSV format is invalid. Check quoted values and commas.";
  }
  if (message.includes("missing required column")) {
    return "A required column is missing.";
  }
  if (message.includes("duplicate column")) {
    return "A required column is missing.";
  }
  if (message.includes("empty file") || message.includes("empty worksheet")) {
    return "The CSV format is invalid. Check quoted values and commas.";
  }
  if (message.includes("choose a csv") || message.includes("xlsx")) {
    return "Choose a CSV or XLSX file.";
  }
  if (
    message.includes("digest") ||
    message.includes("minified react error") ||
    message.includes("#441") ||
    message.includes("server components render") ||
    !raw.trim()
  ) {
    return "The server could not process this file. Check the server logs.";
  }

  // Never surface raw DB / connection strings to the browser.
  if (
    message.includes("database") ||
    message.includes("prisma") ||
    message.includes("postgres") ||
    message.includes("econn") ||
    message.includes("password")
  ) {
    return "The server could not process this file. Check the server logs.";
  }

  if (raw.length > 180) {
    return "The server could not process this file. Check the server logs.";
  }
  return raw;
};
