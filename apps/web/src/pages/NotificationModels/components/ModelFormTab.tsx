import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../../components/Button";
import { CopyRow } from "../../../components/CopyRow";
import { EditableField, editableControlClassName } from "../../../components/EditableField";
import { routes } from "../../../constants/routes";
import { notificationEndpointUrl } from "../../../services/notificationModels.client";
import type { FormDraft } from "../../../types/common.types";
import type { NotificationModel } from "../../../types/notificationModels.types";
import { useBindingOptions } from "../hooks/useBindingOptions";
import type { NotificationModelDraft } from "../types/notificationModels.types";
import { ModelSettingsList } from "./ModelSettingsList";
import { ModelSlotsTable } from "./ModelSlotsTable";
import { ModelUpdateDialog } from "./ModelUpdateDialog";

/** Form tab: name, description, active state, visibility, ingest endpoint with request example (saved models), slots with bindings, settings, and library origin/version. */
export function ModelFormTab({ draft, model }: { draft: FormDraft<NotificationModelDraft>; model: NotificationModel | null }) {
  const options = useBindingOptions();
  const [updating, setUpdating] = useState(false);
  const { values } = draft;

  function field(key: keyof NotificationModelDraft) {
    return {
      error: draft.fieldErrors[key],
      dirty: draft.changedKeys.includes(key),
      onRevert: () => draft.revertField(key)
    };
  }

  const endpoint = model ? notificationEndpointUrl(model.endpointPath) : null;
  const example = endpoint
    ? `curl -X POST ${endpoint} \\\n  -H "Authorization: Bearer <ingest key>" \\\n  -H "Content-Type: application/json" \\\n  -d '{"text": "…"}'`
    : null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <EditableField label="Name" {...field("name")}>
          <input className={editableControlClassName} value={values.name} onChange={(event) => draft.setField("name", event.target.value)} />
        </EditableField>
        <EditableField label="Visibility" {...field("visibility")}>
          <select
            className={editableControlClassName}
            value={values.visibility}
            onChange={(event) => draft.setField("visibility", event.target.value as NotificationModelDraft["visibility"])}
          >
            <option value="private">Private</option>
            <option value="public">Public</option>
          </select>
        </EditableField>
        <div className="sm:col-span-2">
          <EditableField label="Description" {...field("description")}>
            <textarea
              className={editableControlClassName}
              rows={2}
              value={values.description}
              onChange={(event) => draft.setField("description", event.target.value)}
            />
          </EditableField>
        </div>
        <EditableField label="Active" {...field("isActive")}>
          <input type="checkbox" className="h-5 w-5" checked={values.isActive} onChange={(event) => draft.setField("isActive", event.target.checked)} />
        </EditableField>
      </div>

      {endpoint && example ? (
        <section aria-label="Ingest endpoint">
          <h3 className="text-sm font-semibold">Ingest endpoint</h3>
          <CopyRow label="Endpoint URL" value={endpoint} copyLabel="Copy endpoint URL" />
          <CopyRow label="Request example" value={example} copyLabel="Copy request example" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Authenticate with an ingest-only API key.{" "}
            <Link className="text-pine underline" to={`${routes.profile}?tab=security`}>
              Create an ingest key
            </Link>
          </p>
        </section>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">Save the model to get its ingest endpoint.</p>
      )}

      <ModelSlotsTable
        slots={values.slots}
        bindings={values.bindings}
        options={options}
        error={draft.fieldErrors.slots}
        onChange={draft.update}
      />
      <ModelSettingsList settings={values.settings} error={draft.fieldErrors.settings} onChange={(next) => draft.setField("settings", next)} />

      {model?.sourceVersionId ? (
        <section aria-label="Origin">
          <h3 className="text-sm font-semibold">Origin</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Installed from the library
            {model.update?.installedVersion ? `, version ${model.update.installedVersion}` : ""}.
            {model.update?.available ? ` Version ${model.update.latestVersion} is available.` : ""}
            {model.update?.localCodeModified ? " The code was modified locally." : ""}
          </p>
          {model.update?.available ? (
            <Button type="button" className="mt-2" onClick={() => setUpdating(true)}>
              Update to version {model.update.latestVersion}
            </Button>
          ) : null}
          {updating ? <ModelUpdateDialog model={model} onClose={() => setUpdating(false)} /> : null}
        </section>
      ) : null}
    </div>
  );
}
