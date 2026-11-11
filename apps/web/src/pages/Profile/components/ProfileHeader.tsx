import { useRef } from "react";
import { EditableField, editableControlClassName } from "../../../components/EditableField";
import { planLabels } from "../constants";
import { ChangeEmailDialog } from "./ChangeEmailDialog";
import type { useProfileDetails } from "../hooks/useProfileDetails";

/** Identity header of the profile form view: directly editable avatar, name, and email; Save/Discard live in the `FormView` header. */
export function ProfileHeader({
  profile
}: {
  profile: ReturnType<typeof useProfileDetails>;
}) {
  const p = profile;
  const draft = p.draft;
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = p.isLoading || draft.isSaving;
  const avatarClass = "h-20 w-20 shrink-0 rounded-full";

  return (
    <header className="grid grid-cols-1 gap-3">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
        <button
          type="button"
          aria-label="Change profile picture"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className={`${avatarClass} focus-visible:outline focus-visible:outline-2 focus-visible:outline-pine`}
        >
          {p.avatarUrl ? (
            <img
              src={p.avatarUrl}
              alt=""
              className={`${avatarClass} border border-slate-200 object-cover dark:border-slate-700`}
            />
          ) : (
            <span
              aria-hidden="true"
              className={`${avatarClass} flex items-center justify-center bg-mint text-xl font-bold text-pine dark:bg-emerald-950 dark:text-emerald-200`}
            >
              {p.initials}
            </span>
          )}
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          aria-label="Profile picture file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={(event) =>
            draft.setField("avatarFile", event.target.files?.[0] ?? null)
          }
        />
        <div className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
          <h2
            aria-label={p.values.name || undefined}
            className="text-base font-semibold"
          >
            <EditableField
              label="Name"
              hideLabel
              error={draft.fieldErrors.name}
              dirty={draft.changedKeys.includes("name")}
              onRevert={() => draft.revertField("name")}
            >
              <input
                className={editableControlClassName}
                value={p.values.name}
                maxLength={120}
                disabled={busy}
                onChange={(e) => draft.setField("name", e.target.value)}
              />
            </EditableField>
          </h2>
          <div className="mt-2 min-w-0">
            <EditableField
              label="Email"
              error={draft.fieldErrors.email}
              dirty={draft.changedKeys.includes("email")}
              onRevert={() => draft.revertField("email")}
            >
              <input
                type="email"
                className={editableControlClassName}
                value={p.values.email}
                maxLength={255}
                disabled={busy}
                onChange={(e) => draft.setField("email", e.target.value)}
              />
            </EditableField>
          </div>
          {p.user ? (
            <p className="mt-2 inline-block rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {planLabels[p.user.planType]}
            </p>
          ) : null}
          {p.errorMessage ? (
            <p className="mt-2 text-red-600 dark:text-red-400">
              {p.errorMessage}
            </p>
          ) : null}
        </div>
      </div>
      {p.isPasswordPromptOpen ? (
        <ChangeEmailDialog
          email={p.values.email.trim()}
          error={draft.saveError}
          isPending={draft.isSaving}
          onSubmit={p.confirmEmailChange}
          onCancel={p.closePasswordPrompt}
        />
      ) : null}
    </header>
  );
}
