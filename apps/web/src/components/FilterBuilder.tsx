import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  addChild,
  createCondition,
  createEmptyGroup,
  defaultValueForField,
  operatorsForField,
  OPERATOR_LABELS,
  removeNode,
  updateNode,
  type ConditionValue,
  type DomainConditionNode,
  type DomainGroupNode,
  type Operator,
  type SearchFieldConfig
} from "../utils/searchDomain";
import { Button } from "./Button";
import { SelectField, TextInput } from "./FormField";

/**
 * Odoo-style domain builder popup: an unbounded AND/OR condition tree
 * over whatever `fields` the caller passes. Every field/operator/value
 * widget is driven entirely by {@link SearchFieldConfig} — nothing here
 * is specific to any one module's data model.
 *
 * Edits happen against a local draft, seeded from `initialDomain` each
 * time the popup opens; `onApply` only fires when the user clicks
 * "Done". Closing any other way (the X button, clicking the backdrop)
 * discards the draft, so the caller's committed domain — and whatever
 * query it drives — never changes mid-edit.
 */
export function FilterBuilder({
  isOpen,
  onClose,
  fields,
  initialDomain,
  onApply
}: {
  isOpen: boolean;
  onClose: () => void;
  fields: SearchFieldConfig[];
  initialDomain: DomainGroupNode;
  onApply: (domain: DomainGroupNode) => void;
}) {
  const [draftDomain, setDraftDomain] = useState(initialDomain);

  useEffect(() => {
    if (isOpen) setDraftDomain(initialDomain);
    // Only reseed when the popup transitions to open — `initialDomain`
    // identity is expected to change independently (e.g. a pill removed
    // in the searchbar while this popup is closed) without this effect
    // clobbering an in-progress edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const sortedFields = useMemo(
    () => [...fields].sort((a, b) => a.label.localeCompare(b.label)),
    [fields]
  );

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
        className="grid max-h-[85vh] w-full max-w-2xl gap-4 overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Filters</h2>
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Close filters"
            onClick={onClose}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <DomainGroupEditor
          root={draftDomain}
          node={draftDomain}
          fields={sortedFields}
          onRootChange={setDraftDomain}
          isRoot
        />

        <div className="flex justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-700">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDraftDomain(createEmptyGroup("and"))}
          >
            Clear conditions
          </Button>
          <Button type="button" variant="primary" onClick={() => onApply(draftDomain)}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

function DomainGroupEditor({
  root,
  node,
  fields,
  onRootChange,
  isRoot
}: {
  root: DomainGroupNode;
  node: DomainGroupNode;
  fields: SearchFieldConfig[];
  onRootChange: (root: DomainGroupNode) => void;
  isRoot?: boolean;
}) {
  return (
    <div
      className={`grid gap-2 rounded-md border p-3 ${
        isRoot
          ? "border-slate-200 dark:border-slate-700"
          : "border-dashed border-slate-300 dark:border-slate-600"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span>Match</span>
          <select
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-ink outline-none focus:border-pine focus:ring-2 focus:ring-mint dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            value={node.connector}
            onChange={(event) =>
              onRootChange(
                updateNode(root, node.id, (current) => ({
                  ...(current as DomainGroupNode),
                  connector: event.target.value as "and" | "or"
                }))
              )
            }
          >
            <option value="and">all (AND)</option>
            <option value="or">any (OR)</option>
          </select>
          <span>of:</span>
        </div>
        {!isRoot ? (
          <button
            type="button"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Remove group"
            onClick={() => onRootChange(removeNode(root, node.id))}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {node.children.length === 0 ? (
        <p className="text-sm text-slate-400 dark:text-slate-500">No conditions yet.</p>
      ) : null}

      <div className="grid gap-2 pl-2">
        {node.children.map((child) =>
          child.type === "condition" ? (
            <ConditionEditor
              key={child.id}
              root={root}
              condition={child}
              fields={fields}
              onRootChange={onRootChange}
            />
          ) : (
            <DomainGroupEditor
              key={child.id}
              root={root}
              node={child}
              fields={fields}
              onRootChange={onRootChange}
            />
          )
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={fields.length === 0}
          onClick={() =>
            fields[0] && onRootChange(addChild(root, node.id, createCondition(fields[0])))
          }
        >
          + Condition
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onRootChange(addChild(root, node.id, createEmptyGroup("and")))}
        >
          + Group
        </Button>
      </div>
    </div>
  );
}

function ConditionEditor({
  root,
  condition,
  fields,
  onRootChange
}: {
  root: DomainGroupNode;
  condition: DomainConditionNode;
  fields: SearchFieldConfig[];
  onRootChange: (root: DomainGroupNode) => void;
}) {
  const field = fields.find((entry) => entry.name === condition.fieldName) ?? fields[0];

  function patchCondition(patch: Partial<DomainConditionNode>) {
    onRootChange(
      updateNode(root, condition.id, (current) => ({
        ...(current as DomainConditionNode),
        ...patch
      }))
    );
  }

  function selectField(fieldName: string) {
    const nextField = fields.find((entry) => entry.name === fieldName);
    if (!nextField) return;
    const operator = operatorsForField(nextField)[0]!;
    patchCondition({
      fieldName,
      operator,
      value: defaultValueForField(nextField, operator)
    });
  }

  function selectOperator(operator: Operator) {
    if (!field) return;
    patchCondition({ operator, value: defaultValueForField(field, operator) });
  }

  if (!field) return null;
  const operators = operatorsForField(field);

  return (
    <div className="grid gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <SelectField
            label="Field"
            value={field.name}
            onChange={(event) => selectField(event.target.value)}
          >
            {fields.map((entry) => (
              <option key={entry.name} value={entry.name}>
                {entry.label}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Operator"
            value={condition.operator}
            onChange={(event) => selectOperator(event.target.value as Operator)}
          >
            {operators.map((operator) => (
              <option key={operator} value={operator}>
                {OPERATOR_LABELS[operator]}
              </option>
            ))}
          </SelectField>
        </div>
        <button
          type="button"
          className="mt-6 rounded p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          aria-label="Remove condition"
          onClick={() => onRootChange(removeNode(root, condition.id))}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <FieldValueInput
        field={field}
        operator={condition.operator}
        value={condition.value}
        onChange={(value) => patchCondition({ value })}
      />
    </div>
  );
}

function FieldValueInput({
  field,
  operator,
  value,
  onChange
}: {
  field: SearchFieldConfig;
  operator: Operator;
  value: ConditionValue;
  onChange: (value: ConditionValue) => void;
}) {
  if (operator === "isNull" || operator === "isNotNull") return null;

  if (operator === "in" || operator === "notIn") {
    const selected = Array.isArray(value) ? (value as string[]) : [];

    if (field.options) {
      return (
        <div className="grid max-h-48 gap-0.5 overflow-y-auto">
          {field.options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-pine focus:ring-pine dark:border-slate-600 dark:bg-slate-950"
                checked={selected.includes(option.value)}
                onChange={() =>
                  onChange(
                    selected.includes(option.value)
                      ? selected.filter((entry) => entry !== option.value)
                      : [...selected, option.value]
                  )
                }
              />
              {option.label}
            </label>
          ))}
        </div>
      );
    }

    return <MultiValueInput value={selected} onChange={onChange} />;
  }

  const inputType = field.type === "date" ? "date" : field.type === "number" ? "number" : "text";

  if (operator === "between") {
    const [from, to]: [string, string] =
      Array.isArray(value) && value.length === 2 ? (value as [string, string]) : ["", ""];
    return (
      <div className="grid grid-cols-2 gap-2">
        <TextInput
          label="From"
          type={inputType}
          value={from}
          onChange={(event) => onChange([event.target.value, to])}
        />
        <TextInput
          label="To"
          type={inputType}
          value={to}
          onChange={(event) => onChange([from, event.target.value])}
        />
      </div>
    );
  }

  if (field.options) {
    return (
      <SelectField
        label="Value"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectField>
    );
  }

  if (field.type === "boolean") {
    return (
      <SelectField
        label="Value"
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="true">True</option>
        <option value="false">False</option>
      </SelectField>
    );
  }

  return (
    <TextInput
      label="Value"
      type={inputType}
      step={inputType === "number" ? "0.01" : undefined}
      value={typeof value === "string" ? value : ""}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/** A single "add a value" chip input for `in`/`notIn` conditions on fields without a fixed option list. */
function MultiValueInput({
  value,
  onChange
}: {
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commitDraft() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onChange([...value, trimmed]);
    setDraft("");
  }

  return (
    <div className="grid gap-1.5">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.map((entry, index) => (
            <span
              key={`${entry}-${index}`}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {entry}
              <button
                type="button"
                aria-label={`Remove ${entry}`}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <TextInput
        label="Add value"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commitDraft();
          }
        }}
        onBlur={commitDraft}
        placeholder="Type a value, press Enter"
      />
    </div>
  );
}
