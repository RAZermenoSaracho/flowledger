import { HttpError } from "../../../utils/httpError.js";
import type { FinancialProviderAdapter } from "../types/provider.types.js";

/** User-facing message for any operation refused because bank synchronization is switched off. */
export const PROVIDER_UNAVAILABLE_MESSAGE =
  "Bank synchronization is currently unavailable";

/** Builds the 503 returned whenever a provider-backed operation is refused because the provider is unavailable. */
export const providerUnavailable = () =>
  new HttpError(503, PROVIDER_UNAVAILABLE_MESSAGE);

/**
 * Whether a provider may currently be used. Today this is only the provider's global
 * operator switch (`isAvailable`); a future per-user eligibility check (e.g. Premium
 * subscription) belongs here as `isAvailable() && isUserEligible(userId, provider)`.
 */
export function isProviderAvailable(provider: FinancialProviderAdapter) {
  return provider.isAvailable?.() ?? true;
}

/** Throws {@link providerUnavailable} unless {@link isProviderAvailable}. */
export function assertProviderAvailable(provider: FinancialProviderAdapter) {
  if (!isProviderAvailable(provider)) throw providerUnavailable();
}
