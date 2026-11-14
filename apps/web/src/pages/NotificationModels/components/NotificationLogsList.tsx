import { Link } from "react-router-dom";
import { ListView } from "../../../components/ListView";
import { routes } from "../../../constants/routes";
import { usePagination } from "../../../hooks/usePagination";
import * as notificationModelsClient from "../../../services/notificationModels.client";
import type { NotificationRun } from "../../../types/notificationModels.types";
import { formatTimestamp } from "../utils/notificationDisplay";
import { RunStatusBadge } from "./RunStatusBadge";

function LogRow({ run }: { run: NotificationRun }) {
  return (
    <div className="grid gap-1 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={run.status} />
        {run.finishedAt ? <span className="text-slate-500 dark:text-slate-400">{formatTimestamp(run.finishedAt)}</span> : null}
        {run.transactionId ? (
          <Link className="text-pine underline" to={routes.transaction(run.transactionId)}>
            View transaction
          </Link>
        ) : null}
      </div>
      {run.reason ? <p className="break-words">{run.reason}</p> : null}
      {run.text ? <p className="break-words text-slate-500 dark:text-slate-400">{run.text}</p> : null}
    </div>
  );
}

/** Read-only, paginated history of a model's finished runs, newest first; the notification text shows only while it is still retained. */
export function NotificationLogsList({ modelId }: { modelId: string }) {
  const list = usePagination({
    queryKey: ["notification-models", modelId, "logs"],
    resetKey: modelId,
    defaultLimit: 20,
    storageKey: "notification-logs",
    fetchPage: async (pagination) => {
      const { data, meta } = await notificationModelsClient.listNotificationLogs(modelId, pagination);
      return { items: data, total: meta.total, hasNext: meta.hasNext };
    }
  });

  return (
    <ListView
      title="Logs"
      subtitle="Finished notifications, newest first."
      items={list.items}
      rowKey={(run) => run.id}
      renderItem={(run) => <LogRow run={run} />}
      isLoading={list.isLoading}
      error={list.error}
      emptyText="No finished runs yet."
      pager={list.pager}
    />
  );
}
