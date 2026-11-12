# Tasks

Express fix, its own PR to `razs_ai`, independent of B-006.

## 1. API

- [x] 1.1 Add an optional `isAvailable` to `FinancialProviderAdapter`, plus `accounts/utils/providerAvailability.ts` (`isProviderAvailable`, `assertProviderAvailable`, 503 builder). Document the Premium eligibility extension point there.
- [x] 1.2 Add `providers/syncfy/utils/syncfyAvailability.ts` (flag and API key). Gate `fetchJson`, `resyncSyncfyConnection`, `resyncSyncfyCredential`, and the adapter's `createUser`, `createSession` and `createConnectionFlow`. `handleWebhook` returns `ignored`.
- [x] 1.3 Exclude unavailable providers from the connector and institution catalog. `createConnection` returns 503 for an unavailable provider.
- [x] 1.4 Unit tests for each gated function: no Syncfy request or Prisma write when disabled, the enabled path unchanged, and existing data still readable.

## 2. Web

- [x] 2.1 Accounts derives availability from connectors, disables the sync add mode, and replaces Resync and Reconnect with the unavailable message. Add component tests.

## 3. Docs

- [x] 3.1 Update `docs/PROVIDER_SYNC.md`, the root `CLAUDE.md` env table and `.env.example` comment for the new meaning of `SYNCFY_AUTO_SYNC_ENABLED`.
