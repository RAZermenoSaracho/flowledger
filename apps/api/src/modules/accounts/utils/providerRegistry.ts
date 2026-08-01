import { HttpError } from "../../../utils/httpError.js";
import type {
  FinancialProviderAdapter,
  ProviderKey
} from "../types/provider.types.js";
import { syncfyProvider } from "../providers/syncfy/syncfy.adapter.js";

const providers = new Map<ProviderKey, FinancialProviderAdapter>([
  [syncfyProvider.key, syncfyProvider]
]);

export function listProviders() {
  return Array.from(providers.values());
}

export function getProvider(providerKey: ProviderKey) {
  const provider = providers.get(providerKey);
  if (!provider) {
    throw new HttpError(404, `Provider ${providerKey} is not configured`);
  }

  return provider;
}
