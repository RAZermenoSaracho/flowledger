import type { NotificationCondition, NotificationRule, NotificationSlot, NotificationValue } from "@flowledger/shared";
import { Button } from "../../../components/Button";
import { SelectField, TextInput } from "../../../components/FormField";
import { conditionOfKind, withActionKind, type ActionKind } from "../utils/ruleEditing";

const CONDITION_LABELS: Record<NotificationCondition["kind"], string> = {
  contains: "contains",
  not_contains: "does not contain",
  matches: "matches pattern",
  not_matches: "does not match pattern"
};
const ACTION_LABELS: Record<ActionKind, string> = { skip: "Skip with a reason", expense: "Record an expense", income: "Record an income", transfer: "Record a transfer" };

/** Value editor: "Fixed text" or "Captured group N" (only when the rule extracts), and "Automatic" when `optional`. */
function ValueField({
  label,
  value,
  optional,
  canCapture,
  onChange
}: {
  label: string;
  value: NotificationValue | undefined;
  optional?: boolean;
  canCapture: boolean;
  onChange: (value: NotificationValue | undefined) => void;
}) {
  const mode = !value ? "none" : "group" in value ? "group" : "fixed";
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <SelectField
        label={label}
        value={mode}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === "none" ? undefined : next === "group" ? { group: 1 } : { fixed: "" });
        }}
      >
        {optional ? <option value="none">Automatic</option> : null}
        <option value="fixed">Fixed text</option>
        <option value="group" disabled={!canCapture}>
          Captured group
        </option>
      </SelectField>
      {value && "group" in value ? (
        <TextInput label={`${label} group number`} type="number" min={1} value={value.group} onChange={(event) => onChange({ group: Number(event.target.value) })} />
      ) : value ? (
        <TextInput label={`${label} text`} value={value.fixed} onChange={(event) => onChange({ fixed: event.target.value })} />
      ) : null}
    </div>
  );
}

/** Optional slot select listing only the model's declared slots of `kind`; stores the slot key. */
function SlotSelect({
  label,
  kind,
  slots,
  value,
  onChange
}: {
  label: string;
  kind: NotificationSlot["kind"];
  slots: NotificationSlot[];
  value: string | undefined;
  onChange: (key: string | undefined) => void;
}) {
  return (
    <SelectField label={label} value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)}>
      <option value="">None</option>
      {slots
        .filter((slot) => slot.kind === kind)
        .map((slot) => (
          <option key={slot.key} value={slot.key}>
            {slot.label} ({slot.key})
          </option>
        ))}
    </SelectField>
  );
}

/** One editable rule: its conditions, optional extraction and the action it takes, with move/remove controls. */
export function RuleCard({
  rule,
  index,
  total,
  slots,
  onChange,
  onMove,
  onRemove
}: {
  rule: NotificationRule;
  index: number;
  total: number;
  slots: NotificationSlot[];
  onChange: (rule: NotificationRule) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const n = index + 1;
  const action = rule.action;
  const canCapture = Boolean(rule.extract);
  const setCondition = (i: number, next: NotificationCondition) => onChange({ ...rule, conditions: rule.conditions.map((c, j) => (j === i ? next : c)) });
  const setMoney = (patch: Record<string, unknown>) => {
    if (action.kind !== "skip") onChange({ ...rule, action: { ...action, ...patch } as NotificationRule["action"] });
  };

  return (
    <div className="grid gap-4 rounded-md border border-slate-200 p-3 dark:border-slate-800" role="group" aria-label={`Rule ${n}`}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextInput label={`Rule ${n} label`} value={rule.label ?? ""} onChange={(event) => onChange({ ...rule, label: event.target.value || undefined })} />
        </div>
        <Button type="button" variant="secondary" aria-label={`Move rule ${n} up`} disabled={index === 0} onClick={() => onMove(-1)}>
          Up
        </Button>
        <Button type="button" variant="secondary" aria-label={`Move rule ${n} down`} disabled={index === total - 1} onClick={() => onMove(1)}>
          Down
        </Button>
        <Button type="button" variant="secondary" aria-label={`Remove rule ${n}`} disabled={total === 1} onClick={onRemove}>
          Remove
        </Button>
      </div>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">When the notification</legend>
        {rule.conditions.length > 1 ? (
          <SelectField label={`Rule ${n} match`} value={rule.match} onChange={(event) => onChange({ ...rule, match: event.target.value as "all" | "any" })}>
            <option value="all">All of these are true</option>
            <option value="any">Any of these is true</option>
          </SelectField>
        ) : null}
        {rule.conditions.length === 0 ? <p className="text-sm text-slate-500 dark:text-slate-400">Always applies (must be the last rule).</p> : null}
        {rule.conditions.map((condition, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end">
            <SelectField
              label={`Rule ${n} condition ${i + 1} kind`}
              value={condition.kind}
              onChange={(event) => setCondition(i, conditionOfKind(event.target.value as NotificationCondition["kind"], condition))}
            >
              {Object.entries(CONDITION_LABELS).map(([kind, text]) => (
                <option key={kind} value={kind}>
                  {text}
                </option>
              ))}
            </SelectField>
            <TextInput
              label={`Rule ${n} condition ${i + 1} ${"text" in condition ? "text" : "pattern"}`}
              value={"text" in condition ? condition.text : condition.pattern}
              onChange={(event) => setCondition(i, "text" in condition ? { ...condition, text: event.target.value } : { ...condition, pattern: event.target.value })}
            />
            <Button type="button" variant="secondary" aria-label={`Remove condition ${i + 1} of rule ${n}`} onClick={() => onChange({ ...rule, conditions: rule.conditions.filter((_, j) => j !== i) })}>
              Remove
            </Button>
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={condition.ignoreCase} onChange={(event) => setCondition(i, { ...condition, ignoreCase: event.target.checked })} />
              Ignore upper/lower case
            </label>
            {"method" in condition ? (
              <SelectField label={`Rule ${n} condition ${i + 1} method`} value={condition.method} onChange={(event) => setCondition(i, { ...condition, method: event.target.value as "search" | "match" })}>
                <option value="search">Found anywhere in the text</option>
                <option value="match">Must match from the start</option>
              </SelectField>
            ) : null}
          </div>
        ))}
        <div>
          <Button
            type="button"
            variant="secondary"
            disabled={rule.conditions.length >= 10}
            onClick={() => onChange({ ...rule, conditions: [...rule.conditions, { kind: "contains", text: "", ignoreCase: true }] })}
          >
            Add condition to rule {n}
          </Button>
        </div>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Extract values</legend>
        <label className="flex min-h-10 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={canCapture}
            onChange={(event) =>
              onChange({ ...rule, extract: event.target.checked ? { pattern: "", method: "search", ignoreCase: false, missingReason: "no match" } : undefined })
            }
          />
          Pull values out of the text with a pattern (rule {n})
        </label>
        {rule.extract ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <TextInput
              label={`Rule ${n} extract pattern`}
              value={rule.extract.pattern}
              onChange={(event) => onChange({ ...rule, extract: { ...rule.extract!, pattern: event.target.value } })}
            />
            <SelectField label={`Rule ${n} extract method`} value={rule.extract.method} onChange={(event) => onChange({ ...rule, extract: { ...rule.extract!, method: event.target.value as "search" | "match" } })}>
              <option value="search">Found anywhere in the text</option>
              <option value="match">Must match from the start</option>
            </SelectField>
            <TextInput
              label={`Rule ${n} reason if not found`}
              value={rule.extract.missingReason}
              onChange={(event) => onChange({ ...rule, extract: { ...rule.extract!, missingReason: event.target.value } })}
            />
            <label className="flex min-h-10 items-center gap-2 text-sm">
              <input type="checkbox" checked={rule.extract.ignoreCase} onChange={(event) => onChange({ ...rule, extract: { ...rule.extract!, ignoreCase: event.target.checked } })} />
              Ignore upper/lower case
            </label>
          </div>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Then</legend>
        <SelectField label={`Rule ${n} action`} value={action.kind} onChange={(event) => onChange(withActionKind(rule, event.target.value as ActionKind))}>
          {Object.entries(ACTION_LABELS).map(([kind, text]) => (
            <option key={kind} value={kind}>
              {text}
            </option>
          ))}
        </SelectField>
        {action.kind === "skip" ? (
          <TextInput label={`Rule ${n} skip reason`} value={action.reason} onChange={(event) => onChange({ ...rule, action: { kind: "skip", reason: event.target.value } })} />
        ) : (
          <div className="grid gap-3">
            <ValueField label={`Rule ${n} amount`} value={action.amount} canCapture={canCapture} onChange={(value) => value && setMoney({ amount: value })} />
            <ValueField label={`Rule ${n} name`} value={action.name} canCapture={canCapture} onChange={(value) => value && setMoney({ name: value })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <SlotSelect label={`Rule ${n} account`} kind="account" slots={slots} value={action.account} onChange={(account) => setMoney({ account })} />
              {action.kind === "transfer" ? (
                <SlotSelect label={`Rule ${n} to account`} kind="account" slots={slots} value={action.to_account} onChange={(to_account) => setMoney({ to_account })} />
              ) : (
                <>
                  <SlotSelect label={`Rule ${n} category`} kind="category" slots={slots} value={action.category} onChange={(category) => setMoney({ category })} />
                  <SlotSelect label={`Rule ${n} group`} kind="group" slots={slots} value={action.group} onChange={(group) => setMoney({ group })} />
                </>
              )}
            </div>
            <ValueField label={`Rule ${n} currency`} value={action.currency} optional canCapture={canCapture} onChange={(currency) => setMoney({ currency })} />
            <ValueField label={`Rule ${n} notes`} value={action.notes} optional canCapture={canCapture} onChange={(notes) => setMoney({ notes })} />
            <div className="grid gap-2 sm:grid-cols-2">
              <SelectField
                label={`Rule ${n} date`}
                value={action.date ? "group" : "none"}
                onChange={(event) => setMoney({ date: event.target.value === "group" ? { group: 1, format: "%d/%m/%Y" } : undefined })}
              >
                <option value="none">Not set (today)</option>
                <option value="group" disabled={!canCapture}>
                  From a captured group
                </option>
              </SelectField>
              {action.date ? (
                <>
                  <TextInput label={`Rule ${n} date group number`} type="number" min={1} value={action.date.group} onChange={(event) => setMoney({ date: { ...action.date!, group: Number(event.target.value) } })} />
                  <TextInput label={`Rule ${n} date format`} value={action.date.format} onChange={(event) => setMoney({ date: { ...action.date!, format: event.target.value } })} />
                </>
              ) : null}
            </div>
          </div>
        )}
      </fieldset>
    </div>
  );
}
