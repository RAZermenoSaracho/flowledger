/** Identifier of a profile tab; doubles as the value of the `?tab=` search param. */
export type ProfileTabId = "general" | "preferences" | "security" | "subscription";

/** Editable profile fields; `preferredCurrency` is `""` for "no preference" and `avatarFile` is the pending upload. */
export type ProfileDraft = {
  name: string;
  email: string;
  preferredCurrency: string;
  avatarFile: File | null;
};

/** Key of an editable profile field. */
export type ProfileDraftField = keyof ProfileDraft;
