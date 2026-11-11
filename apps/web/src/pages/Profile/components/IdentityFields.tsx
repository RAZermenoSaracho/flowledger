import { EditableField, editableControlClassName } from "../../../components/EditableField";
import type { useProfileDetails } from "../hooks/useProfileDetails";
import type { UsernameStatus } from "../types/profile.types";

const statusText: Record<UsernameStatus, string | null> = {
  unchanged: null,
  invalid: null,
  checking: "Checking availability...",
  available: "Available",
  taken: null
};

/**
 * How other users see the account: the public `username` (with its debounced availability check)
 * and the identity visibility, both fields of the Profile draft saved with the rest of it.
 */
export function IdentityFields({ profile }: { profile: ReturnType<typeof useProfileDetails> }) {
  const { draft, values, usernameStatus } = profile;
  const disabled = profile.isLoading || draft.isSaving;
  const nameLabel = values.name.trim() || "Your name";

  return (
    <section aria-label="Public identity" className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="min-w-0">
        <EditableField
          label="Username"
          error={draft.fieldErrors.username}
          dirty={draft.changedKeys.includes("username")}
          onRevert={() => draft.revertField("username")}
        >
          <input
            className={editableControlClassName}
            value={values.username}
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            onChange={(event) => draft.setField("username", event.target.value.toLowerCase())}
          />
        </EditableField>
        <p role="status" className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {statusText[usernameStatus]}
        </p>
      </div>
      <EditableField
        label="Identity visibility"
        dirty={draft.changedKeys.includes("identityVisibility")}
        onRevert={() => draft.revertField("identityVisibility")}
      >
        <select
          className={editableControlClassName}
          value={values.identityVisibility}
          disabled={disabled}
          onChange={(event) =>
            draft.setField("identityVisibility", event.target.value as typeof values.identityVisibility)
          }
        >
          <option value="username_only">Username only (@{values.username || "username"})</option>
          <option value="username_and_name">
            Name and username ({nameLabel} (@{values.username || "username"}))
          </option>
        </select>
      </EditableField>
    </section>
  );
}
