const dateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "Never";

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown" : dateTime.format(date);
}

export function formatStatus(value: string | null | undefined) {
  return value ? value.replace("_", " ") : "unknown";
}
