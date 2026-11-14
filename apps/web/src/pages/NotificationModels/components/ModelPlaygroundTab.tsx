import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "../../../components/Button";
import { testNotificationModel } from "../../../services/notificationModels.client";
import type { FormDraft } from "../../../types/common.types";
import type { NotificationModelDraft } from "../types/notificationModels.types";

/**
 * Playground tab: runs sample notification text against the unsaved draft code and settings
 * through `POST /:id/test`. Shows the outcome, transaction preview, reason or error with its line,
 * and printed output. Nothing is created or saved. Unavailable until the model is saved (the test route is per model).
 */
export function ModelPlaygroundTab({ modelId, draft }: { modelId: string | null; draft: FormDraft<NotificationModelDraft> }) {
  const [text, setText] = useState("");
  const run = useMutation({
    mutationFn: () => testNotificationModel(modelId!, { text, code: draft.values.code, settings: draft.values.settings })
  });
  const result = run.data;

  if (!modelId) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">Save the model first to try it in the playground.</p>;
  }

  return (
    <div className="grid gap-4">
      <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-300">
        Notification text
        <textarea
          className="min-h-24 w-full rounded-md border border-slate-200 bg-white p-2 text-base text-ink dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:text-sm"
          value={text}
          maxLength={4000}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" disabled={run.isPending || text.trim() === ""} onClick={() => run.mutate()}>
          Run
        </Button>
        <span className="text-sm text-slate-500 dark:text-slate-400">Runs your unsaved code. Nothing is created.</span>
      </div>
      {run.isError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {run.error instanceof Error ? run.error.message : "The test could not run."}
        </p>
      ) : null}
      {result ? (
        <section aria-label="Result" className="grid gap-2 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
          <p>
            Outcome: <strong>{result.outcome}</strong>
          </p>
          {result.reason ? <p>Reason: {result.reason}</p> : null}
          {result.validationErrors?.length ? (
            <ul className="list-disc pl-5 text-red-600 dark:text-red-400">
              {result.validationErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}
          {result.error ? (
            <p role="alert" className="text-red-600 dark:text-red-400">
              {result.error.message}
              {result.error.line ? ` (line ${result.error.line})` : ""}
            </p>
          ) : null}
          {result.transactionPreview ? (
            <div>
              <p className="font-medium">Transaction preview</p>
              <pre className="overflow-x-auto rounded-md bg-slate-100 p-2 text-xs dark:bg-slate-800">
                {JSON.stringify(result.transactionPreview, null, 2)}
              </pre>
              <p className="text-slate-500 dark:text-slate-400">Nothing was created.</p>
            </div>
          ) : null}
          {result.stdout ? (
            <div>
              <p className="font-medium">Printed output</p>
              <pre className="overflow-x-auto rounded-md bg-slate-100 p-2 text-xs dark:bg-slate-800">{result.stdout}</pre>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
