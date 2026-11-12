# Proposal

## Why

FlowLedger's Syncfy credits are exhausted and the integration is not offered to users for now. `SYNCFY_AUTO_SYNC_ENABLED=false` only stops the background scheduler: users can still connect banks, reconnect, and resync manually, and verified webhooks still fetch data. Each of these spends Syncfy credits. Syncfy will later become a Premium feature, but the operator must always be able to switch it off globally.

## What Changes

- **BREAKING (configuration contract):** `SYNCFY_AUTO_SYNC_ENABLED` becomes the global availability switch for the whole Syncfy integration, not just the scheduler. When it is false, or `SYNCFY_API_KEY` is unset, Syncfy is unavailable.
- Unavailable means the following:
  - `GET /providers/connectors` and `/providers/institutions` return no Syncfy entries.
  - Connect, reconnect, credential refresh, connection resync and account resync return `503 "Bank synchronization is currently unavailable"` before any Syncfy request or Syncfy-related DB write.
  - Verified webhooks are still HMAC-checked and recorded, but not processed.
  - The scheduler stays off.
  - Every outbound Syncfy request is refused at the single HTTP helper as a backstop.
- Availability is an optional `isAvailable()` capability on `FinancialProviderAdapter`, read through one `isProviderAvailable()` helper. That helper is the documented extension point for future per-user Premium eligibility.
- On the web, Accounts derives availability from the connectors list. The "Sync accounts" option, Resync and Reconnect are replaced by "Bank synchronization is currently unavailable."
- Existing accounts, provider metadata, imported transactions, balances and reports stay readable and are left unchanged.

## Non-goals

No subscription, billing, entitlement or upgrade flow, no new environment variable, and no deletion of connections or imported data.

## Capabilities

### Modified Capabilities
- `syncfy-auto-sync`: the flag now gates all Syncfy operations, and the "manual sync is independent of the flag" requirement is removed.

## Impact

- `apps/api/src/modules/accounts/` (adapter type, availability helper, catalog, connection create service, Syncfy adapter, resync services and HTTP helper) and `apps/web/src/pages/Accounts/`, plus docs.
- Deployment: any environment that relies on manual Syncfy while the scheduler is off must set `SYNCFY_AUTO_SYNC_ENABLED=true`. Production already intends it to be off.
