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

export function getSyncfyRefreshMetadata(rawData: unknown) {
  const raw = getJsonObject(rawData);
  const metadata = getJsonObject(raw?.syncfyRefreshMetadata);

  if (!metadata) return undefined;

  return {
    providerUserId: getString(metadata.providerUserId),
    endpoints: metadata.endpoints
  };
}

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

export function getEndpointSummary(endpoints: unknown) {
  const summary = summarizeSyncfyEndpoints(endpoints);

  return {
    hasEndpoints:
      summary.accountEndpointCount > 0 || summary.transactionEndpointCount > 0,
    endpointTypes: summary.endpointTypes
  };
}

export function providerAccountKey(
  providerCredentialId: string,
  providerAccountId: string
) {
  return `${providerCredentialId}:${providerAccountId}`;
}

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

export function shouldMarkSyncfyManualReconnect(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(mfa|otp|token|credential|unauthorized|forbidden|expired|interactive|login|session|401|403)/i.test(
    message
  );
}

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

export function nextSyncfyImportedTransactionStatus(input: {
  status: string;
  transactionId?: string | null;
}) {
  if (input.status === "imported") {
    return input.transactionId ? "processed" : "pending";
  }

  return input.status;
}

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

export function countNewSyncfyImportedTransactionIds(input: {
  existingTransactionIds: Set<string>;
  transactions: Pick<NormalizedSyncfyTransaction, "syncfyTransactionId">[];
}) {
  return input.transactions.filter(
    (transaction) =>
      !input.existingTransactionIds.has(transaction.syncfyTransactionId)
  ).length;
}

export function safeFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}
