import { env } from "../../../../../config/env.js";
import { providerUnavailable } from "../../../utils/providerAvailability.js";

/**
 * Global availability of the whole Syncfy integration. `SYNCFY_AUTO_SYNC_ENABLED` is the
 * operator switch for every Syncfy operation (connect, reconnect, manual resync, webhook
 * processing, scheduled sync), not just the scheduler; a missing API key also disables it.
 */
export function isSyncfyAvailable() {
  return env.SYNCFY_AUTO_SYNC_ENABLED && Boolean(env.SYNCFY_API_KEY);
}

/** Throws the provider-unavailable 503 unless {@link isSyncfyAvailable}; call before any Syncfy request or Syncfy-related DB write. */
export function assertSyncfyAvailable() {
  if (!isSyncfyAvailable()) throw providerUnavailable();
}
