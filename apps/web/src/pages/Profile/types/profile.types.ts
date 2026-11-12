import type { IdentityVisibility } from "../../../types/users.types";

/** Identifier of a profile tab; doubles as the value of the `?tab=` search param. */
export type ProfileTabId = "general" | "preferences" | "security" | "blocked" | "subscription";

/** Editable profile fields; `preferredCurrency` is `""` for "no preference" and `avatarFile` is the pending upload. */
export type ProfileDraft = {
  name: string;
  email: string;
  username: string;
  nickname: string;
  identityVisibility: IdentityVisibility;
  preferredCurrency: string;
  avatarFile: File | null;
};

/** Key of an editable profile field. */
export type ProfileDraftField = keyof ProfileDraft;

/** Outcome of the debounced username availability check shown under the username field. */
export type UsernameStatus = "unchanged" | "invalid" | "checking" | "available" | "taken";
