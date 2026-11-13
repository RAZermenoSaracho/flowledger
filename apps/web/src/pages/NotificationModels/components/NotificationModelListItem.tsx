import { Link } from "react-router-dom";
import { RecordCard } from "../../../components/RecordCard";
import { routes } from "../../../constants/routes";
import type { NotificationModelSummary } from "../../../types/notificationModels.types";
import { publicationLabel } from "../utils/notificationDisplay";
import { RunStatusBadge } from "./RunStatusBadge";

const pill = "rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300";

/** One row of the notification models list: name linking to the model, active badge, publication badge (only when published) and last run status. */
export function NotificationModelListItem({ model }: { model: NotificationModelSummary }) {
  return (
    <RecordCard
      title={
        <Link to={routes.notificationModel(model.id)} className="break-words font-semibold hover:underline">
          {model.name}
        </Link>
      }
      subtitle={
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className={pill}>{model.isActive ? "Active" : "Inactive"}</span>
          {model.publication.published ? <span className={pill}>{publicationLabel(model.publication)}</span> : null}
          <RunStatusBadge status={model.lastRunStatus} />
        </div>
      }
    />
  );
}
