const relativeFormat = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

/** Formats an ISO date as a relative phrase in whole days (e.g. "in 30 days", "yesterday"). */
function formatRelativeDays(iso: string, now: Date = new Date()): string {
  const days = Math.round((new Date(iso).getTime() - now.getTime()) / 86_400_000);
  return relativeFormat.format(days, "day");
}

/** Expiry line for a key: "Never expires", or absolute date plus relative distance. */
export function formatExpiry(expiresAt: string | null, now: Date = new Date()): string {
  if (!expiresAt) return "Never expires";
  return `Expires ${new Date(expiresAt).toLocaleDateString()} (${formatRelativeDays(expiresAt, now)})`;
}

/** Last-used line for a key: "Never used" or a relative phrase. */
export function formatLastUsed(lastUsedAt: string | null, now: Date = new Date()): string {
  return lastUsedAt ? `Last used ${formatRelativeDays(lastUsedAt, now)}` : "Never used";
}
