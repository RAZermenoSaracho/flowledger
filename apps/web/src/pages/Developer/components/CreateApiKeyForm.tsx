import type { CreateApiKeyInput, CredentialLifetime } from "@flowledger/shared";
import { FormEvent, useState } from "react";
import { Button } from "../../../components/Button";
import { TextInput } from "../../../components/FormField";

const lifetimeOptions: { value: CredentialLifetime; label: string }[] = [
  { value: "1d", label: "1 day" },
  { value: "1m", label: "1 month" },
  { value: "1y", label: "1 year" },
  { value: "never", label: "Never" }
];

const radioLabel = "flex min-h-11 items-center gap-2 text-sm";

/**
 * Form for creating a personal API key (name, Read / Read+Write, lifetime).
 * Defaults to read-only with a 1 month lifetime; `onSubmit` may reject, in which
 * case the message is shown inline.
 */
export function CreateApiKeyForm({
  onSubmit,
  disabled
}: {
  onSubmit: (input: CreateApiKeyInput) => Promise<void>;
  disabled?: boolean;
}) {
  const [name, setName] = useState("");
  const [allowWrite, setAllowWrite] = useState(false);
  const [lifetime, setLifetime] = useState<CredentialLifetime>("1m");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onSubmit({ name, allowWrite, lifetime });
      setName("");
      setAllowWrite(false);
      setLifetime("1m");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Key could not be created");
    }
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <TextInput
        label="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        required
        maxLength={60}
      />
      <fieldset>
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Permissions
        </legend>
        <label className={radioLabel}>
          <input
            type="radio"
            name="permissions"
            checked={!allowWrite}
            onChange={() => setAllowWrite(false)}
          />
          Read
        </label>
        <label className={radioLabel}>
          <input
            type="radio"
            name="permissions"
            checked={allowWrite}
            onChange={() => setAllowWrite(true)}
          />
          Read + Write
        </label>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Lifetime
        </legend>
        {lifetimeOptions.map((option) => (
          <label key={option.value} className={radioLabel}>
            <input
              type="radio"
              name="lifetime"
              checked={lifetime === option.value}
              onChange={() => setLifetime(option.value)}
            />
            {option.label}
          </label>
        ))}
        {lifetime === "never" ? (
          <p className="text-sm text-red-600 dark:text-red-400">
            Warning: a key that never expires stays valid until you revoke it.
          </p>
        ) : null}
      </fieldset>
      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      <Button type="submit" className="min-h-11 sm:w-fit" disabled={disabled}>
        Create API key
      </Button>
    </form>
  );
}
