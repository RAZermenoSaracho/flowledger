import type { NotificationModelPublication, NotificationRunStatus } from "../../../types/notificationModels.types";

/** Characters of notification text a queue row shows. */
export const QUEUE_PREVIEW_LENGTH = 80;

/** Display label of a run status. */
export function runStatusLabel(status: NotificationRunStatus | null | undefined) {
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "No runs yet";
}

/** Tailwind classes for a run status badge. */
export function runStatusClass(status: NotificationRunStatus | null | undefined) {
  if (status === "completed") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
  if (status === "failed") return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
  if (status === "processing") return "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200";
  return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
}

/** Read-only publication status text: "Published · v{n}" only when published, else "Not published". */
export function publicationLabel(publication: NotificationModelPublication | null | undefined) {
  return publication?.published ? `Published · v${publication.latestVersion}` : "Not published";
}

/** Formats a millisecond span as its two largest units, e.g. `2h 5m`, `45s`; negative spans read `0s`. */
export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    [days, "d"],
    [hours, "h"],
    [minutes, "m"],
    [seconds, "s"]
  ] as const;
  const first = parts.findIndex(([value]) => value > 0);
  if (first === -1) return "0s";
  return parts
    .slice(first, first + 2)
    .filter(([value]) => value > 0)
    .map(([value, unit]) => `${value}${unit}`)
    .join(" ");
}

/** Formats an ISO timestamp in the viewer's locale. */
export function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString();
}
