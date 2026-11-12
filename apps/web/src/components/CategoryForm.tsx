import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import { FormEvent, useEffect, useState } from "react";
import type { CategoryFormValues } from "../types/categories.types";
import { formatEnumLabel } from "../utils/enumLabels";
import { Button } from "./Button";
import { SelectField, TextInput } from "./FormField";

const DEFAULT_VALUES: CategoryFormValues = {
  name: "",
  type: "expense",
  color: "#176b52"
};

/**
 * Name / type / color fields with submit and optional cancel buttons. Owns its field state,
 * seeded from `initialValues`. `onSubmit` may reject: the message is shown inline and the
 * entered values are kept. `onDirtyChange` reports whether any field differs from `initialValues`.
 * Without `onCancel` no Cancel button is rendered.
 */
export function CategoryForm({
  initialValues = DEFAULT_VALUES,
  submitLabel,
  pending,
  onSubmit,
  onCancel,
  onDirtyChange
}: {
  initialValues?: CategoryFormValues;
  submitLabel: string;
  pending?: boolean;
  onSubmit: (values: CategoryFormValues) => Promise<unknown>;
  onCancel?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [name, setName] = useState(initialValues.name);
  const [type, setType] = useState<CategoryType>(initialValues.type);
  const [color, setColor] = useState(initialValues.color);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name !== initialValues.name ||
    type !== initialValues.type ||
    color !== initialValues.color;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({ name, type, color });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save category.");
    }
  }

  return (
    <form className="grid gap-3" onSubmit={submit}>
      <TextInput
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label="Type"
          value={type}
          onChange={(event) => setType(event.target.value as CategoryType)}
        >
          {CATEGORY_TYPES.map((item) => (
            <option key={item} value={item}>
              {formatEnumLabel(item)}
            </option>
          ))}
        </SelectField>
        <TextInput
          label="Color"
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
