import type { UpdateUserPreferencesInput } from "@flowledger/shared";
import { getCurrentUser } from "./read.service.js";
import { updateProfile } from "./update.service.js";

/**
 * Updates only the caller's name and/or preferred currency through `updateProfile`, passing the current email
 * unchanged so credential-based clients can never change the login identifier.
 */
export async function updatePreferences(userId: string, input: UpdateUserPreferencesInput) {
  const current = await getCurrentUser(userId);
  return updateProfile(userId, {
    name: input.name ?? current.name,
    email: current.email,
    preferredCurrency: input.preferredCurrency
  });
}
