/** Identifier of a profile tab; doubles as the value of the `?tab=` search param. */
export type ProfileTabId = "general" | "preferences" | "security" | "subscription";

/** Editable profile fields; `preferredCurrency` is `""` for "no preference". */
export type ProfileDraft = { name: string; email: string; preferredCurrency: string };

/** Key of an inline-editable profile field. */
export type ProfileDraftField = keyof ProfileDraft;
