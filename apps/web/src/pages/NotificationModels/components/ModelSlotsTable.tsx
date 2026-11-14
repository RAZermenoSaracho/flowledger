import type { NotificationSlot } from "@flowledger/shared";
import { Button } from "../../../components/Button";
import { SelectField, TextInput } from "../../../components/FormField";
import type { BindingOptions, NotificationModelDraft } from "../types/notificationModels.types";

const MAX_SLOTS = 20;
const SLOT_KINDS: NotificationSlot["kind"][] = ["account", "category", "group"];

/**
 * Editor for a model's slots: each is a named placeholder the script refers to (`account="card"`),
 * with a binding select limited to the caller's own records of that kind. Removing a slot, or
 * changing its key or kind, drops its binding so the draft never keeps one for a slot that no longer matches.
 */
export function ModelSlotsTable({
  slots,
  bindings,
  options,
  error,
  onChange
}: {
  slots: NotificationSlot[];
  bindings: Record<string, string>;
  options: BindingOptions;
  error?: string;
  onChange: (update: (draft: NotificationModelDraft) => NotificationModelDraft) => void;
}) {
  function patchSlot(index: number, patch: Partial<NotificationSlot>) {
    onChange((draft) => {
      const previous = draft.slots[index]!;
      const next = { ...previous, ...patch };
      const rest = { ...draft.bindings };
      if (patch.key !== undefined || patch.kind !== undefined) delete rest[previous.key];
      return { ...draft, slots: draft.slots.map((slot, i) => (i === index ? next : slot)), bindings: rest };
    });
  }

  function removeSlot(index: number) {
    onChange((draft) => {
      const { [draft.slots[index]!.key]: _removed, ...rest } = draft.bindings;
      return { ...draft, slots: draft.slots.filter((_, i) => i !== index), bindings: rest };
    });
  }

  function addSlot() {
    onChange((draft) => ({
      ...draft,
      slots: [...draft.slots, { key: `slot_${draft.slots.length + 1}`, kind: "account", label: "New slot", required: false }]
    }));
  }

  function bind(key: string, id: string) {
    onChange((draft) => {
      const { [key]: _old, ...rest } = draft.bindings;
      return { ...draft, bindings: id ? { ...rest, [key]: id } : rest };
    });
  }

  return (
    <section className="grid gap-3" aria-label="Slots">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Slots</h3>
        <Button type="button" variant="secondary" disabled={slots.length >= MAX_SLOTS} onClick={addSlot}>
          Add slot
        </Button>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Scripts refer to records by slot key; bind each slot to one of your records. Required slots must be bound before the model can be active.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {slots.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">No slots.</p> : null}
      {slots.map((slot, index) => (
        <div key={index} className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-2 dark:border-slate-800">
          <TextInput label="Key" value={slot.key} onChange={(event) => patchSlot(index, { key: event.target.value })} />
          <TextInput label="Label" value={slot.label} onChange={(event) => patchSlot(index, { label: event.target.value })} />
          <SelectField label="Kind" value={slot.kind} onChange={(event) => patchSlot(index, { kind: event.target.value as NotificationSlot["kind"] })}>
            {SLOT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </SelectField>
          <SelectField label={`Bound ${slot.kind} for ${slot.key}`} value={bindings[slot.key] ?? ""} onChange={(event) => bind(slot.key, event.target.value)}>
            <option value="">Not bound</option>
            {options[slot.kind].map((record) => (
              <option key={record.id} value={record.id}>
                {record.name}
              </option>
            ))}
          </SelectField>
          <label className="flex min-h-10 items-center gap-2 text-sm">
            <input type="checkbox" checked={slot.required} onChange={(event) => patchSlot(index, { required: event.target.checked })} />
            Required
          </label>
          <div className="flex items-center sm:justify-end">
            <Button type="button" variant="secondary" aria-label={`Remove slot ${slot.key}`} onClick={() => removeSlot(index)}>
              Remove
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
