import { AccountType } from "@prisma/client";
import type { ProviderAccountListRecord } from "../types/accounts.types.js";

/** Narrows an unknown value to a plain object, or `{}` if it isn't one (arrays included). */
export function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Narrows an unknown value to a trimmed, non-empty string, or `undefined` otherwise. */
export function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/** Coerces an unknown value (number or numeric string) to a finite number, or `undefined` otherwise. */
export function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

/** Infers a FlowLedger `AccountType` from a free-text provider type string via keyword matching (English/Spanish), defaulting to `other`. */
export function normalizeAccountType(value: unknown): AccountType {
  const rawType = getString(value)?.toLowerCase() ?? "";
  if (/credit|card|tarjeta/.test(rawType)) return AccountType.credit_card;
  if (/saving|ahorro/.test(rawType)) return AccountType.savings;
  if (/checking|debit|bank|cuenta/.test(rawType)) return AccountType.checking;
  if (/broker|invest|inversion/.test(rawType)) return AccountType.investment;
  if (/cash|efectivo/.test(rawType)) return AccountType.cash;

  return AccountType.other;
}

/** Builds a display summary of an imported provider account from its raw `accountMetadata`, its confirmation/link status, and any account it's linked to. */
export function providerAccountSummary(
  providerAccount: ProviderAccountListRecord
) {
  const metadata = getRecord(providerAccount.accountMetadata);

  return {
    id: providerAccount.id,
    provider: providerAccount.provider,
    institutionName: providerAccount.connection?.institutionName ?? null,
    name: getString(metadata.name) ?? "Imported account",
    type: normalizeAccountType(metadata.type),
    providerType: getString(metadata.type) ?? null,
    currency: getString(metadata.currency) ?? null,
    balance: getNumber(metadata.balance) ?? null,
    status: providerAccount.status,
    failureReason: providerAccount.failureReason,
    requiresManualReconnect: providerAccount.requiresManualReconnect,
    lastSyncAt: providerAccount.lastSyncAt,
    lastSyncSuccessAt: providerAccount.lastSyncSuccessAt,
    lastSyncFailureAt: providerAccount.lastSyncFailureAt,
    connectionStatus: providerAccount.connection?.status ?? null,
    connectionFailureReason: providerAccount.connection?.failureReason ?? null,
    connectionRequiresManualReconnect:
      providerAccount.connection?.requiresManualReconnect ?? false,
    linkedAccountId: providerAccount.accountId,
    linkedAccount: providerAccount.account
      ? {
          id: providerAccount.account.id,
          name: providerAccount.account.name,
          type: providerAccount.account.type
        }
      : null,
    createdAt: providerAccount.createdAt,
    updatedAt: providerAccount.updatedAt
  };
}
