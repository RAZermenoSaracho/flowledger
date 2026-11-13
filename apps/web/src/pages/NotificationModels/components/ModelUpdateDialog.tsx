import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { Button } from "../../../components/Button";
import { SelectField } from "../../../components/FormField";
import { ModalDialog } from "../../../components/ModalDialog";
import { getNotificationLibraryEntry, updateNotificationModelFromSource } from "../../../services/notificationModels.client";
import type { NotificationModel } from "../../../types/notificationModels.types";
import { useBindingOptions } from "../hooks/useBindingOptions";
import { CodeEditor } from "./CodeEditor";

/**
 * Update-from-source dialog for a library copy: current and new code read-only (side by side from `md`,
 * stacked below), a warning when the copy's code was modified locally (the update replaces it), and a
 * select for every required slot of the new version that has no binding yet. Confirming calls
 * update-from-source, refreshes the model queries and closes. Needs `model.update.sourceModelId` and `latestVersionId`.
 */
export function ModelUpdateDialog({ model, onClose }: { model: NotificationModel; onClose: () => void }) {
  const titleId = useId();
  const queryClient = useQueryClient();
  const options = useBindingOptions();
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const { update } = model;
  const entry = useQuery({
    queryKey: ["notification-library", update?.sourceModelId],
    enabled: Boolean(update?.sourceModelId),
    queryFn: async () => (await getNotificationLibraryEntry(update!.sourceModelId!)).entry
  });
  const newSlots = (entry.data?.slots ?? []).filter((slot) => slot.required && !model.bindings[slot.key]);
  const ready = Boolean(entry.data) && newSlots.every((slot) => chosen[slot.key]);

  const apply = useMutation({
    mutationFn: () =>
      updateNotificationModelFromSource(model.id, {
        versionId: update!.latestVersionId!,
        ...(newSlots.length ? { bindings: Object.fromEntries(newSlots.map((slot) => [slot.key, chosen[slot.key]!])) } : {})
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notification-models"] });
      onClose();
    }
  });

  return (
    <ModalDialog titleId={titleId} title={`Update to version ${update?.latestVersion ?? ""}`} onCancel={onClose} widthClass="w-[min(60rem,calc(100vw-1rem))]">
      <div className="mt-3 grid gap-4">
        {update?.localCodeModified ? (
          <p role="alert" className="rounded-md bg-amber-50 p-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            You changed this model's code locally. Updating replaces it with the new version's code.
          </p>
        ) : null}
        {entry.isLoading ? <p className="text-sm">Loading the new version...</p> : null}
        {entry.isError ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">Could not load the new version.</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid min-w-0 gap-1">
            <p className="text-sm font-medium">Current code</p>
            <CodeEditor value={model.code} readOnly label="Current code" />
          </div>
          <div className="grid min-w-0 gap-1">
            <p className="text-sm font-medium">New code</p>
            <CodeEditor value={entry.data?.code ?? ""} readOnly label="New code" />
          </div>
        </div>
        {newSlots.map((slot) => (
          <SelectField
            key={slot.key}
            label={`Bind ${slot.label} (${slot.key})`}
            value={chosen[slot.key] ?? ""}
            onChange={(event) => setChosen((current) => ({ ...current, [slot.key]: event.target.value }))}
          >
            <option value="">Choose a {slot.kind}</option>
            {options[slot.kind].map((record) => (
              <option key={record.id} value={record.id}>
                {record.name}
              </option>
            ))}
          </SelectField>
        ))}
        {apply.isError ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {apply.error.message}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!ready || apply.isPending} onClick={() => apply.mutate()}>
            Update
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}
