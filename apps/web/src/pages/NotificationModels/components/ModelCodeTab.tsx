import { useMutation } from "@tanstack/react-query";
import { Button } from "../../../components/Button";
import { notificationHelpers } from "../../../constants/notificationHelpers";
import { validateNotificationCode } from "../../../services/notificationModels.client";
import type { FormDraft } from "../../../types/common.types";
import type { NotificationModelDraft } from "../types/notificationModels.types";
import { CodeEditor } from "./CodeEditor";

/** Code tab: the script editor bound to the draft, a Check action listing errors by line (highlighted in the editor), the draft's own code error from a failed save, and a collapsible helper reference. */
export function ModelCodeTab({ draft }: { draft: FormDraft<NotificationModelDraft> }) {
  const check = useMutation({ mutationFn: (code: string) => validateNotificationCode(code).then((result) => result.errors) });
  const errors = check.data ?? [];

  return (
    <div className="grid gap-4">
      <CodeEditor
        value={draft.values.code}
        errorLines={errors.map((item) => item.line)}
        onChange={(code) => {
          draft.setField("code", code);
          check.reset();
        }}
      />
      {draft.fieldErrors.code ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {draft.fieldErrors.code}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" disabled={check.isPending} onClick={() => check.mutate(draft.values.code)}>
          Check
        </Button>
        {check.isSuccess && errors.length === 0 ? <span role="status" className="text-sm text-emerald-700 dark:text-emerald-300">No errors found.</span> : null}
        {check.isError ? <span role="alert" className="text-sm text-red-600 dark:text-red-400">Could not check the code.</span> : null}
      </div>
      {errors.length > 0 ? (
        <ul role="alert" className="grid gap-1 text-sm text-red-600 dark:text-red-400">
          {errors.map((item, index) => (
            <li key={index}>
              Line {item.line}: {item.message}
            </li>
          ))}
        </ul>
      ) : null}

      <details className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <summary className="cursor-pointer text-sm font-semibold">Function reference</summary>
        <div className="mt-3 grid gap-4">
          {notificationHelpers.map((helper) => (
            <div key={helper.name} className="grid gap-1 text-sm">
              <code className="break-words font-semibold">{helper.signature}</code>
              <p className="text-slate-600 dark:text-slate-300">{helper.description}</p>
              <pre className="overflow-x-auto rounded-md bg-slate-100 p-2 text-xs dark:bg-slate-800">{helper.example}</pre>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
