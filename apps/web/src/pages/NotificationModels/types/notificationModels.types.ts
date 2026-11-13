import type { NotificationSlot } from "@flowledger/shared";

/** Editable values of a notification model, shared by every tab of the detail view. */
export type NotificationModelDraft = {
  name: string;
  description: string;
  code: string;
  isActive: boolean;
  slots: NotificationSlot[];
  bindings: Record<string, string>;
  settings: Record<string, string>;
};

/** Tabs of the detail view, in display order. */
export type NotificationModelTabId = "form" | "code" | "playground" | "queue" | "logs";

/** Selectable records per slot kind, as `{ id, name }`. */
export type BindingOptions = Record<"account" | "category" | "group", { id: string; name: string }[]>;
