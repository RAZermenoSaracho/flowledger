import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../components/Button";
import { RecordCard } from "../../../components/RecordCard";
import { routes } from "../../../constants/routes";
import { getNotificationLibraryEntry, installNotificationModel } from "../../../services/notificationModels.client";
import type { NotificationLibraryEntry } from "../../../types/notificationModels.types";
import { CodeEditor } from "./CodeEditor";

/** One library row: name, version, author and description, a read-only code view fetched on demand, and Install, which opens the new copy's Form tab to bind its slots. */
export function LibraryEntryCard({ entry }: { entry: NotificationLibraryEntry }) {
  const navigate = useNavigate();
  const [showCode, setShowCode] = useState(false);
  const code = useQuery({
    queryKey: ["notification-library", entry.modelId],
    enabled: showCode,
    queryFn: async () => (await getNotificationLibraryEntry(entry.modelId)).entry.code ?? ""
  });
  const install = useMutation({
    mutationFn: () => installNotificationModel(entry.modelId),
    onSuccess: ({ model }) => navigate(routes.notificationModel(model.id, "form"))
  });

  return (
    <RecordCard
      title={<p className="break-words font-semibold">{entry.name}</p>}
      subtitle={
        <div className="mt-1 grid gap-1 text-slate-500 dark:text-slate-400">
          <p>
            Version {entry.version} · by @{entry.author.username ?? "unknown"}
          </p>
          {entry.description ? <p className="break-words">{entry.description}</p> : null}
        </div>
      }
    >
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" aria-expanded={showCode} onClick={() => setShowCode((open) => !open)}>
          {showCode ? "Hide code" : "View code"}
        </Button>
        <Button type="button" disabled={install.isPending} onClick={() => install.mutate()}>
          Install
        </Button>
      </div>
      {install.isError ? (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {install.error.message}
        </p>
      ) : null}
      {showCode ? (
        <div className="mt-3">
          {code.isLoading ? <p className="text-sm">Loading code...</p> : null}
          {code.isError ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">Could not load the code.</p> : null}
          {code.data !== undefined ? <CodeEditor value={code.data} readOnly label={`Code of ${entry.name}`} /> : null}
        </div>
      ) : null}
    </RecordCard>
  );
}
