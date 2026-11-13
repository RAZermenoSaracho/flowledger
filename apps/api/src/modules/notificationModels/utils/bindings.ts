import { badRequest } from "../../../utils/httpError.js";
import type { ModelBindings, ModelSlots } from "../types/notificationModels.types.js";

/** Keys of required slots that have no binding. */
export function unboundRequiredSlots(slots: ModelSlots, bindings: ModelBindings): string[] {
  return slots.filter((slot) => slot.required && !bindings[slot.key]).map((slot) => slot.key);
}

/** Throws 400 with the required slot keys missing bindings in `details.unboundSlots`. */
export function assertRequiredBound(slots: ModelSlots, bindings: ModelBindings) {
  const unbound = unboundRequiredSlots(slots, bindings);
  if (unbound.length) {
    throw badRequest(`Required slots are not bound: ${unbound.join(", ")}`, { unboundSlots: unbound });
  }
}
