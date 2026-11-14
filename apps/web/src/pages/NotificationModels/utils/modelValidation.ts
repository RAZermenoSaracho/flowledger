import type { FormErrors } from "../../../types/common.types";
import type { NotificationModelDraft } from "../types/notificationModels.types";

const SLOT_KEY = /^[a-z][a-z0-9_]{0,39}$/;

/** Returns an error per invalid field of a model draft, using the same limits as the API (name 1-80, code 20000, up to 20 unique slot keys, up to 30 settings). */
export function validateNotificationModelDraft(values: NotificationModelDraft): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) errors.name = "Name is required";
  else if (values.name.trim().length > 80) errors.name = "Name must be at most 80 characters";
  if (values.description.length > 500) errors.description = "Description must be at most 500 characters";
  if (values.code.length > 20000) errors.code = "Code must be at most 20,000 characters";

  const seen = new Set<string>();
  for (const slot of values.slots) {
    if (!SLOT_KEY.test(slot.key)) {
      errors.slots = "Slot keys are lowercase letters, digits and underscores, starting with a letter (max 40)";
      break;
    }
    if (seen.has(slot.key)) {
      errors.slots = "Slot keys must be unique";
      break;
    }
    seen.add(slot.key);
    if (!slot.label.trim()) {
      errors.slots = "Every slot needs a label";
      break;
    }
  }
  if (values.slots.length > 20) errors.slots = "At most 20 slots";

  const settingKeys = Object.keys(values.settings);
  if (settingKeys.length > 30) errors.settings = "At most 30 settings";
  else if (settingKeys.some((key) => !key.trim() || key.length > 60)) errors.settings = "Setting names are required (max 60)";
  return errors;
}
