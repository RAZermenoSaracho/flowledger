import { HttpError } from "../../../utils/httpError.js";
import type {
  FinancialProviderAdapter,
  ProviderKey
} from "../types/provider.types.js";
import { syncfyProvider } from "../providers/syncfy/syncfy.adapter.js";

const providers = new Map<ProviderKey, FinancialProviderAdapter>([
  [syncfyProvider.key, syncfyProvider]
]);

/** Returns all registered provider adapters. */
export function listProviders() {
  return Array.from(providers.values());
}

/** Looks up a provider adapter by key, throwing 404 if it isn't registered/configured. */
export function getProvider(providerKey: ProviderKey) {
  const provider = providers.get(providerKey);
  if (!provider) {
    throw new HttpError(404, `Provider ${providerKey} is not configured`);
  }

  return provider;
}
