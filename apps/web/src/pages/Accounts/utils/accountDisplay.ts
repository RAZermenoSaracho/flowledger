const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

/** Formats an ISO timestamp for display, falling back to "Never" (missing) or "Unknown" (invalid). */
export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : dateTime.format(date);
}

/** Formats a status code for display, replacing underscores with spaces. */
export function formatStatus(value: string | null | undefined) {
  return value ? value.replace("_", " ") : "unknown";
}
