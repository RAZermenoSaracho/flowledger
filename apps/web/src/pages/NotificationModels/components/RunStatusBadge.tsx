import type { NotificationRunStatus } from "../../../types/notificationModels.types";
import { runStatusClass, runStatusLabel } from "../utils/notificationDisplay";

/** Small pill showing a run status; `null` reads "No runs yet". */
export function RunStatusBadge({ status }: { status: NotificationRunStatus | null }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${runStatusClass(status)}`}>{runStatusLabel(status)}</span>
  );
}
