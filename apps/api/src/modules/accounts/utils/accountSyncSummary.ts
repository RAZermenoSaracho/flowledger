import type { ProviderAccountWithConnection } from "../types/accounts.types.js";

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/** Builds a display-ready sync summary for one provider account, falling back to the parent connection's status/failure/timestamps where the provider account itself doesn't carry its own. */
export function providerAccountSyncSummary(
  providerAccount: ProviderAccountWithConnection
) {
  const metadata = getRecord(providerAccount.accountMetadata);

  return {
    id: providerAccount.id,
    provider: providerAccount.provider,
    providerCredentialId: providerAccount.providerCredentialId,
    providerAccountId: providerAccount.providerAccountId,
    institutionId: providerAccount.connection?.institutionId ?? null,
    institutionName: providerAccount.connection?.institutionName ?? null,
    accountName: getString(metadata.name),
    accountType: getString(metadata.type),
    currency: getString(metadata.currency),
    externalBalance: getNumber(metadata.balance),
    status: providerAccount.status,
    failureReason:
      providerAccount.failureReason ??
      providerAccount.connection?.failureReason ??
      null,
    requiresManualReconnect:
      providerAccount.requiresManualReconnect ||
      providerAccount.connection?.requiresManualReconnect ||
      false,
    connectionStatus: providerAccount.connection?.status ?? null,
    lastSyncAt:
      providerAccount.lastSyncAt ??
      providerAccount.connection?.lastSyncAt ??
      null,
    lastSyncSuccessAt:
      providerAccount.lastSyncSuccessAt ??
      providerAccount.connection?.lastSyncSuccessAt ??
      null,
    lastSyncFailureAt:
      providerAccount.lastSyncFailureAt ??
      providerAccount.connection?.lastSyncFailureAt ??
      null,
    createdAt: providerAccount.createdAt,
    updatedAt: providerAccount.updatedAt
  };
}

/** Attaches per-provider-account sync summaries to an account for list responses, and derives `source` ("synced" vs "manual") from whether any exist. */
export function accountListItemWithSyncSummary<
  TAccount extends { providerAccounts: ProviderAccountWithConnection[] }
>(account: TAccount) {
  const sync = account.providerAccounts.map(providerAccountSyncSummary);
  const { providerAccounts: _providerAccounts, ...safeAccount } = account;

  return {
    ...safeAccount,
    source: sync.length > 0 ? "synced" : "manual",
    sync
  };
}
