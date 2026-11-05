import { useRef } from "react";
import { Button } from "../../../components/Button";
import { TextInput } from "../../../components/FormField";
import { planLabels } from "../constants";
import { ProfileInlineField } from "./ProfileInlineField";
import type { useProfileDetails } from "../hooks/useProfileDetails";

/** Identity header of the profile form view: inline-editable avatar, name, and email, with a Save/Cancel bar while dirty. */
export function ProfileHeader({
  profile
}: {
  profile: ReturnType<typeof useProfileDetails>;
}) {
  const p = profile;
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = p.isLoading || p.isSaving;
  const avatarClass = "h-20 w-20 shrink-0 rounded-full";

  return (
    <header className="grid grid-cols-1 gap-3">
      {p.isDirty ? (
        <div
          role="group"
          aria-label="Unsaved changes"
          className="flex flex-wrap items-center gap-2"
        >
          <Button type="button" onClick={p.save} disabled={p.isSaving}>
            {p.isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={p.cancel}
            disabled={p.isSaving}
          >
            Cancel
          </Button>
          {p.saveError ? (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {p.saveError}
            </p>
          ) : null}
        </div>
      ) : null}
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
          onChange={(event) => p.setAvatarFile(event.target.files?.[0] ?? null)}
        />
        <div className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
          <h1
            aria-label={p.values.name || undefined}
            className="text-base font-semibold"
          >
            <ProfileInlineField
              label="Name"
              hideLabel
              display={p.values.name || "Loading..."}
              error={p.fieldErrors.name}
              disabled={busy}
              onRevert={() => p.revertField("name")}
            >
              <TextInput
                label="Name"
                value={p.values.name}
                maxLength={120}
                disabled={busy}
                aria-invalid={Boolean(p.fieldErrors.name)}
                onChange={(e) => p.setField("name", e.target.value)}
              />
            </ProfileInlineField>
          </h1>
          <div className="mt-2 min-w-0">
            <ProfileInlineField
              label="Email"
              display={p.values.email || "Loading..."}
              error={p.fieldErrors.email}
              disabled={busy}
              onRevert={() => p.revertField("email")}
            >
              <TextInput
                label="Email"
                type="email"
                value={p.values.email}
                maxLength={255}
                disabled={busy}
                aria-invalid={Boolean(p.fieldErrors.email)}
                onChange={(e) => p.setField("email", e.target.value)}
              />
            </ProfileInlineField>
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
    </header>
  );
}
