import { z } from "zod";
import { currencyCodeSchema, dateStringSchema, positiveDecimalAmountSchema } from "./common.js";

const slotKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Slot key must match ^[a-z][a-z0-9_]{0,39}$");

/** One named record placeholder a model's script refers to; the owner binds it to a real account, category or group. */
export const notificationSlotSchema = z.object({
  key: slotKey,
  kind: z.enum(["account", "category", "group"]),
  label: z.string().trim().min(1).max(80),
  required: z.boolean()
});

/** Up to 20 slots with unique keys. */
export const notificationSlotsSchema = z
  .array(notificationSlotSchema)
  .max(20)
  .refine((slots) => new Set(slots.map((slot) => slot.key)).size === slots.length, "Slot keys must be unique");

/** Map of slot key to the bound record id. */
export const notificationBindingsSchema = z.record(slotKey, z.string().min(1));

/** Up to 30 string settings, each value at most 500 characters. */
export const notificationSettingsSchema = z
  .record(z.string().min(1).max(60), z.string().max(500))
  .refine((settings) => Object.keys(settings).length <= 30, "At most 30 settings");

/** Model script source, at most 20,000 characters. */
export const notificationCodeSchema = z.string().max(20000);

/** Whether a model is private to its owner or published to the library. */
export const notificationModelVisibilitySchema = z.enum(["private", "public"]);

const modelFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).nullish(),
  code: notificationCodeSchema,
  slots: notificationSlotsSchema,
  bindings: notificationBindingsSchema,
  settings: notificationSettingsSchema,
  isActive: z.boolean(),
  visibility: notificationModelVisibilitySchema
};

/** POST /notification-models body; everything but `name` is optional and defaults to an empty, inactive, private model. */
export const createNotificationModelSchema = z.object({
  name: modelFields.name,
  description: modelFields.description,
  code: modelFields.code.default(""),
  slots: modelFields.slots.default([]),
  bindings: modelFields.bindings.default({}),
  settings: modelFields.settings.default({}),
  isActive: modelFields.isActive.default(false),
  visibility: modelFields.visibility.default("private")
});

/** PATCH /notification-models/:id body; every field optional. */
export const updateNotificationModelSchema = z.object(modelFields).partial();

/** POST /notification-models/:id/test body: sample text plus optional unsaved code and settings. */
export const notificationTestSchema = z.object({
  text: z.string().min(1).max(4000),
  code: notificationCodeSchema.optional(),
  settings: notificationSettingsSchema.optional()
});

/** Public ingest contract: exactly `{ text }`, any extra field is rejected. */
export const notificationIngestSchema = z.object({ text: z.string().min(1).max(4000) }).strict();

const proposalBase = {
  name: z.string().trim().min(1).max(160),
  amount: positiveDecimalAmountSchema,
  currency: currencyCodeSchema,
  date: dateStringSchema.optional(),
  account: slotKey,
  category: slotKey.optional(),
  group: slotKey.optional(),
  notes: z.string().max(1000).optional()
};

/** A script's result, discriminated on `kind`; slot references are keys, resolved through the model's bindings. */
export const notificationProposalSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("expense"), ...proposalBase }),
  z.object({ kind: z.literal("income"), ...proposalBase }),
  z.object({
    kind: z.literal("transfer"),
    ...proposalBase,
    to_account: slotKey,
    destination_amount: positiveDecimalAmountSchema.optional()
  }),
  z.object({ kind: z.literal("skip"), reason: z.string().max(200) })
]);

/** POST /notification-models/:id/update-from-source body. */
export const updateFromSourceSchema = z.object({
  versionId: z.string().min(1),
  bindings: notificationBindingsSchema.optional()
});

/** Parsed update-from-source body. */
export type UpdateFromSourceInput = z.infer<typeof updateFromSourceSchema>;
/** One slot definition. */
export type NotificationSlot = z.infer<typeof notificationSlotSchema>;
/** Parsed create-model body. */
export type CreateNotificationModelInput = z.infer<typeof createNotificationModelSchema>;
/** Parsed update-model body. */
export type UpdateNotificationModelInput = z.infer<typeof updateNotificationModelSchema>;
/** A validated script proposal. */
export type NotificationProposal = z.infer<typeof notificationProposalSchema>;

/** POST /notification-models/validate body. */
export const validateNotificationCodeSchema = z.object({ code: notificationCodeSchema });

/** Query string of the model, queue and log list routes: an optional DSQL JSON `query`. */
export const notificationListQuerySchema = z.object({ query: z.string().max(4000).optional() });
