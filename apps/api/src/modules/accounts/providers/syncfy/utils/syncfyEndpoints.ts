import { env } from "../../../../../config/env.js";
import { HttpError } from "../../../../../utils/httpError.js";
import type {
  NormalizedSyncfyAccount,
  NormalizedSyncfyTransaction,
  StoredSyncfyRefreshMetadata
} from "../types/syncfy.types.js";
import {
  buildSyncfyDataUrl,
  getJsonObject,
  getString,
  sanitizeSyncfyDataEndpoint
} from "./syncfyHttp.js";

const syncfyDataBaseUrl = env.SYNCFY_DATA_BASE_URL;
const syncfyTransactionLookbackDays = env.SYNCFY_TRANSACTION_LOOKBACK_DAYS;
const syncfyTransactionPageLimit = 500;

/** Extracts the `accounts` or `transactions` endpoint list from stored endpoint metadata, accepting either an array or a single string. */
export function getSyncfyEndpointList(
  endpoints: unknown,
  key: "accounts" | "transactions"
) {
  const endpointMap = getJsonObject(endpoints);
  if (!endpointMap) return [];

  const value = endpointMap[key];

  if (Array.isArray(value)) {
    return value.filter((endpoint): endpoint is string =>
      Boolean(getString(endpoint))
    );
  }

  const endpoint = getString(value);
  return endpoint ? [endpoint] : [];
}

/** Counts the account/transaction endpoints present in stored endpoint metadata, for logging and summary display. */
export function summarizeSyncfyEndpoints(endpoints: unknown) {
  const accountEndpointCount = getSyncfyEndpointList(
    endpoints,
    "accounts"
  ).length;
  const transactionEndpointCount = getSyncfyEndpointList(
    endpoints,
    "transactions"
  ).length;

  return {
    accountEndpointCount,
    transactionEndpointCount,
    endpointTypes: [
      accountEndpointCount > 0 ? "accounts" : null,
      transactionEndpointCount > 0 ? "transactions" : null
    ].filter((value): value is string => Boolean(value))
  };
}

/** Sanitizes an endpoint list, dropping any entry whose host or path doesn't match the expected `accounts`/`transactions` shape. */
export function sanitizeSyncfyEndpointList(
  endpoints: unknown,
  key: "accounts" | "transactions"
) {
  return getSyncfyEndpointList(endpoints, key)
    .map((endpoint) => sanitizeSyncfyDataEndpoint(endpoint))
    .filter((endpoint) => {
      const pathname = new URL(endpoint, syncfyDataBaseUrl).pathname;
      return key === "accounts"
        ? pathname === "/v1/accounts"
        : pathname === "/v1/transactions";
    });
}

/** Builds the metadata object stored on a `ProviderConnection` after a credential refresh, so a later resync can replay it without the original webhook payload. */
export function buildSyncfyRefreshMetadata(input: {
  providerCredentialId: string;
  providerUserId: string;
  endpoints: unknown;
  now?: Date;
}): StoredSyncfyRefreshMetadata {
  const endpoints = {
    accounts: sanitizeSyncfyEndpointList(input.endpoints, "accounts"),
    transactions: sanitizeSyncfyEndpointList(input.endpoints, "transactions")
  };
  const now = (input.now ?? new Date()).toISOString();

  return {
    provider: "syncfy" as const,
    providerCredentialId: input.providerCredentialId,
    providerUserId: input.providerUserId,
    endpoints,
    storedAt: now,
    updatedAt: now,
    endpointSummary: summarizeSyncfyEndpoints(endpoints)
  };
}

/** Reads back stored Syncfy refresh metadata from a `ProviderConnection.rawData` value; returns `undefined` if none is present. */
export function getSyncfyRefreshMetadata(rawData: unknown) {
  const raw = getJsonObject(rawData);
  const metadata = getJsonObject(raw?.syncfyRefreshMetadata);

  if (!metadata) return undefined;

  return {
    providerUserId: getString(metadata.providerUserId),
    endpoints: metadata.endpoints
  };
}

/** Builds a paged Syncfy transaction-fetch URL, replacing any existing paging/date-range params with a lookback window ending at `now` (or the current time). */
export function buildSyncfyTransactionDataUrl(input: {
  endpoint: string;
  token: string;
  skip?: number;
  limit?: number;
  now?: Date;
}) {
  const limit = input.limit ?? syncfyTransactionPageLimit;
  const skip = input.skip ?? 0;
  const now = input.now ?? new Date();
  const toSeconds = Math.floor(now.getTime() / 1000);
  const fromSeconds =
    toSeconds - syncfyTransactionLookbackDays * 24 * 60 * 60;
  const url = buildSyncfyDataUrl(input.endpoint, input.token);

  if (url.pathname !== "/v1/transactions") {
    throw new HttpError(400, "Unexpected Syncfy transaction endpoint path");
  }

  url.searchParams.delete("dt_refresh_from");
  url.searchParams.delete("dt_refresh_to");
  url.searchParams.delete("limit");
  url.searchParams.delete("skip");
  url.searchParams.set("dt_refresh_from", String(fromSeconds));
  url.searchParams.set("dt_refresh_to", String(toSeconds));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("skip", String(skip));

  return url;
}

/** Reduces endpoint metadata to a `hasEndpoints` flag plus which endpoint types are present, for display and storage summaries. */
export function getEndpointSummary(endpoints: unknown) {
  const summary = summarizeSyncfyEndpoints(endpoints);

  return {
    hasEndpoints:
      summary.accountEndpointCount > 0 || summary.transactionEndpointCount > 0,
    endpointTypes: summary.endpointTypes
  };
}

/** Builds the composite lookup key used to map Syncfy accounts/transactions to `ProviderAccount` rows by credential + account id. */
export function providerAccountKey(
  providerCredentialId: string,
  providerAccountId: string
) {
  return `${providerCredentialId}:${providerAccountId}`;
}

/** Builds the display metadata blob stored on a `ProviderAccount` row from a normalized Syncfy account. */
export function buildSyncfyProviderAccountMetadata(
  account: Pick<NormalizedSyncfyAccount, "name" | "type" | "currency" | "balance">
) {
  return {
    name: account.name,
    type: account.type,
    currency: account.currency,
    balance: account.balance
  };
}

/** Hashes account balances (sorted for determinism) into a comparable fingerprint, used to detect balance changes between retry attempts. */
export function syncfyBalanceFingerprint(accounts: NormalizedSyncfyAccount[]) {
  return JSON.stringify(
    accounts
      .map((account) => ({
        id: account.syncfyAccountId,
        credentialId: account.syncfyCredentialId ?? null,
        balance: account.balance ?? null,
        currency: account.currency ?? null
      }))
      .sort((left, right) =>
        `${left.credentialId ?? ""}:${left.id}`.localeCompare(
          `${right.credentialId ?? ""}:${right.id}`
        )
      )
  );
}

/** Decides whether a resync retry loop should stop early: stops as soon as new transactions were written, the transaction count or balance fingerprint changed since the previous attempt, or attempts are exhausted. */
export function shouldStopSyncfyRefreshRetry(input: {
  attemptIndex: number;
  totalAttempts: number;
  previousFetchedTransactionsCount?: number;
  previousBalanceFingerprint?: string;
  fetchedTransactionsCount: number;
  balanceFingerprint: string;
  insertedOrUpdatedImportedTransactions: number;
}) {
  if (input.insertedOrUpdatedImportedTransactions > 0) return true;
  if (input.attemptIndex >= input.totalAttempts - 1) return true;
  if (
    input.previousFetchedTransactionsCount !== undefined &&
    input.previousFetchedTransactionsCount !== input.fetchedTransactionsCount
  ) {
    return true;
  }
  if (
    input.previousBalanceFingerprint !== undefined &&
    input.previousBalanceFingerprint !== input.balanceFingerprint
  ) {
    return true;
  }

  return false;
}

/** Detects, from an error's message, whether it indicates the user must manually reconnect (MFA/OTP/expired credential/auth failure) rather than a transient failure. */
export function shouldMarkSyncfyManualReconnect(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(mfa|otp|token|credential|unauthorized|forbidden|expired|interactive|login|session|401|403)/i.test(
    message
  );
}

/** Computes the status for a newly-seen imported transaction: `"pending"` if there's no prior status, otherwise the transition computed by {@link nextSyncfyImportedTransactionStatus}. */
export function resolveSyncfyImportedTransactionStatus(input: {
  existingStatus?: string | null;
  transactionId?: string | null;
}) {
  if (!input.existingStatus) return "pending";

  return nextSyncfyImportedTransactionStatus({
    status: input.existingStatus,
    transactionId: input.transactionId
  });
}

/** Advances an `"imported"` transaction to `"processed"` once it's linked to a `Transaction`, or back to `"pending"` if not; leaves any other status untouched. */
export function nextSyncfyImportedTransactionStatus(input: {
  status: string;
  transactionId?: string | null;
}) {
  if (input.status === "imported") {
    return input.transactionId ? "processed" : "pending";
  }

  return input.status;
}

/** Splits a fetched transaction batch into inserted-or-updated vs. already-present-and-skipped counts, for import summaries. */
export function summarizeSyncfyImportedTransactionWrites(input: {
  existingTransactionIds: Set<string>;
  transactions: Pick<NormalizedSyncfyTransaction, "syncfyTransactionId">[];
}) {
  const skippedDuplicateTransactions = input.transactions.filter((transaction) =>
    input.existingTransactionIds.has(transaction.syncfyTransactionId)
  ).length;

  return {
    insertedOrUpdatedImportedTransactions:
      input.transactions.length - skippedDuplicateTransactions,
    skippedDuplicateTransactions
  };
}

/** Filters a transaction batch down to those not already stored and maps each to the shape needed to insert a `ProviderImportedTransaction`. */
export function buildPendingSyncfyImportedTransactionCandidates(input: {
  existingTransactionIds: Set<string>;
  transactions: NormalizedSyncfyTransaction[];
}) {
  return input.transactions
    .filter(
      (transaction) =>
        !input.existingTransactionIds.has(transaction.syncfyTransactionId)
    )
    .map((transaction) => ({
      providerTransactionId: transaction.syncfyTransactionId,
      providerCredentialId: transaction.syncfyCredentialId,
      providerAccountId: transaction.syncfyAccountId,
      description: transaction.description,
      amount: transaction.amount,
      currency: transaction.currency,
      transactionDate: transaction.transactionDate,
      refreshDate: transaction.refreshDate,
      status: resolveSyncfyImportedTransactionStatus({}),
      rawData: transaction.rawData
    }));
}

/** Counts how many transactions in a batch are not already present in `existingTransactionIds`. */
export function countNewSyncfyImportedTransactionIds(input: {
  existingTransactionIds: Set<string>;
  transactions: Pick<NormalizedSyncfyTransaction, "syncfyTransactionId">[];
}) {
  return input.transactions.filter(
    (transaction) =>
      !input.existingTransactionIds.has(transaction.syncfyTransactionId)
  ).length;
}

/** Extracts an error's message and truncates it to 1000 characters, the safe size for storing in a `failureReason` column. */
export function safeFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}
