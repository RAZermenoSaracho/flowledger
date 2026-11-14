import { DEFAULT_NOTIFICATION_RULES, generateNotificationCode, type NotificationSlot } from "@flowledger/shared";

/** Script a new model opens with: the canonical code of the default visual rules, so Form shows them without a rewrite. */
export const NEW_MODEL_CODE = generateNotificationCode(DEFAULT_NOTIFICATION_RULES);

/** Slots a new model starts with; the default rule refers to none. */
export const NEW_MODEL_SLOTS: NotificationSlot[] = [];
