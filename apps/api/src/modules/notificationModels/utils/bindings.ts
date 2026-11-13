import type { ModelBindings, ModelSlots } from "../types/notificationModels.types.js";

/** Keys of required slots that have no binding. */
export function unboundRequiredSlots(slots: ModelSlots, bindings: ModelBindings): string[] {
  return slots.filter((slot) => slot.required && !bindings[slot.key]).map((slot) => slot.key);
}

/** Keys bound in `bindings` that no slot declares. */
export function undeclaredBindingKeys(slots: ModelSlots, bindings: ModelBindings): string[] {
  const declared = new Set(slots.map((slot) => slot.key));
  return Object.keys(bindings).filter((key) => !declared.has(key));
}
