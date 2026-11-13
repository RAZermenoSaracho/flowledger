import { badRequest } from "../../../utils/httpError.js";
import type { ModelBindings, ModelSlots } from "../types/notificationModels.types.js";

/** Keys of required slots that have no binding. */
export function unboundRequiredSlots(slots: ModelSlots, bindings: ModelBindings): string[] {
  return slots.filter((slot) => slot.required && !bindings[slot.key]).map((slot) => slot.key);
}

/** Throws 400 naming each unbound required slot as `Label (key)`; the keys are in `details.unboundSlots`. */
export function assertRequiredBound(slots: ModelSlots, bindings: ModelBindings) {
  const unbound = unboundRequiredSlots(slots, bindings);
  if (unbound.length) {
    const names = unbound.map((key) => `${slots.find((slot) => slot.key === key)!.label} (${key})`).join(", ");
    throw badRequest(`Required slots are not bound: ${names}. Bind them in the Form tab before activating.`, { unboundSlots: unbound });
  }
}
