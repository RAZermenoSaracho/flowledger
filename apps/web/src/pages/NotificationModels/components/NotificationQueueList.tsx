import { ListView } from "../../../components/ListView";
import { usePagination } from "../../../hooks/usePagination";
import * as notificationModelsClient from "../../../services/notificationModels.client";
import type { NotificationRun } from "../../../types/notificationModels.types";
import { formatDuration, formatTimestamp, QUEUE_PREVIEW_LENGTH } from "../utils/notificationDisplay";
import { RunStatusBadge } from "./RunStatusBadge";

/** How often the open Queue tab re-fetches its window. */
export const QUEUE_POLL_MS = 10_000;

function QueueRow({ run, position }: { run: NotificationRun; position: number | null }) {
  const preview = run.text === null ? "" : run.text.slice(0, QUEUE_PREVIEW_LENGTH);
  return (
    <div className="grid gap-1 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <RunStatusBadge status={run.status} />
        {position !== null ? <span className="font-semibold">Position {position}</span> : null}
      </div>
      <dl className="grid gap-x-4 gap-y-1 text-slate-500 sm:grid-cols-3 dark:text-slate-400">
        <div>
          <dt className="inline">Received </dt>
          <dd className="inline">{formatTimestamp(run.receivedAt)}</dd>
        </div>
        <div>
          <dt className="inline">Waiting </dt>
          <dd className="inline">{formatDuration(Date.now() - new Date(run.receivedAt).getTime())}</dd>
        </div>
        {run.startedAt ? (
          <div>
            <dt className="inline">Started </dt>
            <dd className="inline">{formatTimestamp(run.startedAt)}</dd>
          </div>
        ) : null}
      </dl>
      {preview ? <p className="break-words">{preview}</p> : null}
    </div>
  );
}

/**
 * Read-only queue of a model's queued and processing runs, oldest first, re-fetched every
 * `QUEUE_POLL_MS` while mounted. A queued row's position is its window offset plus its index plus one;
 * processing rows have none. Offers no cancel, retry, reorder, delete or concurrency controls.
 */
export function NotificationQueueList({ modelId }: { modelId: string }) {
  const list = usePagination({
    queryKey: ["notification-models", modelId, "queue"],
    resetKey: modelId,
    defaultLimit: 20,
    storageKey: "notification-queue",
    refetchIntervalMs: QUEUE_POLL_MS,
    fetchPage: async (pagination) => {
      const { data, meta } = await notificationModelsClient.listNotificationQueue(modelId, pagination);
      return { items: data, total: meta.total, hasNext: meta.hasNext };
    }
  });
  const positions = new Map(list.items.map((run, index) => [run.id, list.pager.offset + index + 1]));

  return (
    <ListView
      title="Queue"
      subtitle="Queued and processing notifications, oldest first. Refreshes every 10 seconds."
      items={list.items}
      rowKey={(run) => run.id}
      renderItem={(run) => <QueueRow run={run} position={run.status === "queued" ? (positions.get(run.id) ?? null) : null} />}
      isLoading={list.isLoading}
      error={list.error}
      emptyText="Nothing is waiting."
      pager={list.pager}
    />
  );
}
