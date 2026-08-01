import { prisma } from "../../../../../db/prisma.js";
import { HttpError } from "../../../../../utils/httpError.js";
import type { SyncfyProcessingSummary, SyncfyResyncSummary } from "../types/syncfy.types.js";
import { getJsonObject, wait, withTimeout } from "../utils/syncfyHttp.js";
import {
  getSyncfyRefreshMetadata,
  safeFailureReason,
  shouldMarkSyncfyManualReconnect,
  shouldStopSyncfyRefreshRetry,
  summarizeSyncfyEndpoints,
  syncfyBalanceFingerprint
} from "../utils/syncfyEndpoints.js";
import { processSyncfyCredentialRefresh } from "./create.service.js";

const manualSyncfyRefreshRetryDelaysMs = [0, 5_000, 15_000, 30_000] as const;

async function processSyncfyCredentialRefreshWithRetry(input: {
  idUser: string;
  userId: string;
  providerCredentialId: string;
  endpoints: unknown;
  retryDelaysMs: readonly number[];
}) {
  const retryDelaysMs = input.retryDelaysMs.length > 0 ? input.retryDelaysMs : [0];
  let previousFetchedTransactionsCount: number | undefined;
  let previousBalanceFingerprint: string | undefined;
  let latestResult: SyncfyProcessingSummary | undefined;

  for (const [attemptIndex, delayMs] of retryDelaysMs.entries()) {
    await wait(delayMs);

    const result = await processSyncfyCredentialRefresh({
      idUser: input.idUser,
      userId: input.userId,
      providerCredentialId: input.providerCredentialId,
      endpoints: input.endpoints
    });
    const balanceFingerprint =
      result.balanceFingerprint ?? syncfyBalanceFingerprint([]);
    latestResult = {
      ...result,
      refreshAttemptCount: attemptIndex + 1
    };

    console.info("[SYNCFY REFRESH] Credential refresh attempt completed", {
      providerCredentialId: input.providerCredentialId,
      userId: input.userId,
      attempt: attemptIndex + 1,
      maxAttempts: retryDelaysMs.length,
      fetchedAccountsCount: result.importedAccounts,
      fetchedTransactionsCount: result.importedTransactions,
      insertedOrUpdatedImportedTransactionsCount:
        result.insertedOrUpdatedImportedTransactions ?? 0,
      skippedDuplicateTransactionsCount:
        result.skippedDuplicateTransactions ?? 0,
      fetchedTransactionCountChanged:
        previousFetchedTransactionsCount !== undefined &&
        previousFetchedTransactionsCount !== result.importedTransactions,
      externalBalancesChanged:
        previousBalanceFingerprint !== undefined &&
        previousBalanceFingerprint !== balanceFingerprint
    });

    if (
      shouldStopSyncfyRefreshRetry({
        attemptIndex,
        totalAttempts: retryDelaysMs.length,
        previousFetchedTransactionsCount,
        previousBalanceFingerprint,
        fetchedTransactionsCount: result.importedTransactions,
        balanceFingerprint,
        insertedOrUpdatedImportedTransactions:
          result.insertedOrUpdatedImportedTransactions ?? 0
      })
    ) {
      break;
    }

    previousFetchedTransactionsCount = result.importedTransactions;
    previousBalanceFingerprint = balanceFingerprint;
  }

  if (!latestResult) {
    throw new HttpError(500, "Syncfy refresh did not run");
  }

  return latestResult;
}

async function markSyncfyCredentialManualReconnect(input: {
  userId?: string | null;
  connectionId?: string;
  providerCredentialId: string;
  failureReason: string;
}) {
  const now = new Date();

  await prisma.providerConnection.updateMany({
    where: {
      ...(input.connectionId ? { id: input.connectionId } : {}),
      provider: "syncfy",
      providerCredentialId: input.providerCredentialId,
      ...(input.userId ? { userId: input.userId } : {})
    },
    data: {
      status: "reconnect_required",
      failureReason: input.failureReason,
      requiresManualReconnect: true,
      lastSyncFailureAt: now
    }
  });

  await prisma.providerAccount.updateMany({
    where: {
      provider: "syncfy",
      providerCredentialId: input.providerCredentialId,
      ...(input.userId ? { userId: input.userId } : {})
    },
    data: {
      status: "reconnect_required",
      failureReason: input.failureReason,
      requiresManualReconnect: true,
      lastSyncFailureAt: now
    }
  });
}

export async function resyncSyncfyConnection(input: {
  userId: string;
  connectionId: string;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
}): Promise<SyncfyResyncSummary> {
  const connection = await prisma.providerConnection.findFirst({
    where: {
      id: input.connectionId,
      userId: input.userId,
      provider: "syncfy"
    }
  });

  if (!connection) {
    throw new HttpError(404, "Syncfy connection was not found");
  }

  const storedMetadata = getSyncfyRefreshMetadata(connection.rawData);
  const legacyRawData = getJsonObject(connection.rawData);
  const endpoints = storedMetadata?.endpoints ?? legacyRawData?.endpoints;
  const providerUserId =
    storedMetadata?.providerUserId ?? connection.providerUserId;
  const endpointSummary = summarizeSyncfyEndpoints(endpoints);

  console.info("[SYNCFY REFRESH] Loaded stored endpoint metadata", {
    providerCredentialId: connection.providerCredentialId,
    userId: input.userId,
    hasStoredRefreshMetadata: Boolean(storedMetadata?.endpoints),
    endpointTypes: endpointSummary.endpointTypes,
    accountEndpointCount: endpointSummary.accountEndpointCount,
    transactionEndpointCount: endpointSummary.transactionEndpointCount
  });

  if (!providerUserId || !endpoints) {
    const failureReason =
      "Stored Syncfy refresh metadata is unavailable. Manual reconnect is required.";
    await markSyncfyCredentialManualReconnect({
      userId: input.userId,
      connectionId: connection.id,
      providerCredentialId: connection.providerCredentialId,
      failureReason
    });

    return {
      status: "manual_reconnect_required",
      importedAccounts: 0,
      importedTransactions: 0,
      requiresManualReconnect: true,
      failureReason
    };
  }

  try {
    const refresh =
      input.retryDelaysMs && input.retryDelaysMs.length > 0
        ? processSyncfyCredentialRefreshWithRetry({
            idUser: providerUserId,
            userId: input.userId,
            providerCredentialId: connection.providerCredentialId,
            endpoints,
            retryDelaysMs: input.retryDelaysMs
          })
        : processSyncfyCredentialRefresh({
            idUser: providerUserId,
            userId: input.userId,
            providerCredentialId: connection.providerCredentialId,
            endpoints
          });
    const result = input.timeoutMs
      ? await withTimeout(refresh, input.timeoutMs)
      : await refresh;

    console.info("[SYNCFY REFRESH] Completed credential refresh", {
      providerCredentialId: connection.providerCredentialId,
      userId: input.userId,
      fetchedAccountsCount: result.importedAccounts,
      fetchedTransactionsCount: result.importedTransactions,
      insertedOrUpdatedImportedTransactionsCount:
        result.insertedOrUpdatedImportedTransactions ?? 0,
      skippedDuplicateTransactionsCount:
        result.skippedDuplicateTransactions ?? 0,
      refreshAttemptCount: result.refreshAttemptCount ?? 1
    });

    return {
      status: "processed",
      importedAccounts: result.importedAccounts,
      importedTransactions: result.importedTransactions,
      insertedOrUpdatedImportedTransactions:
        result.insertedOrUpdatedImportedTransactions,
      skippedDuplicateTransactions: result.skippedDuplicateTransactions,
      refreshAttemptCount: result.refreshAttemptCount,
      requiresManualReconnect: false
    };
  } catch (error) {
    const failureReason = safeFailureReason(error);
    const requiresManualReconnect = shouldMarkSyncfyManualReconnect(error);

    if (requiresManualReconnect) {
      await markSyncfyCredentialManualReconnect({
        userId: input.userId,
        connectionId: connection.id,
        providerCredentialId: connection.providerCredentialId,
        failureReason
      });

      return {
        status: "manual_reconnect_required",
        importedAccounts: 0,
        importedTransactions: 0,
        requiresManualReconnect: true,
        failureReason
      };
    }

    await prisma.providerConnection.update({
      where: { id: connection.id },
      data: {
        status: "sync_failed",
        failureReason,
        requiresManualReconnect: false,
        lastSyncFailureAt: new Date()
      }
    });
    console.warn("[SYNCFY REFRESH] Credential refresh failed", {
      providerCredentialId: connection.providerCredentialId,
      userId: input.userId,
      requiresManualReconnect: false,
      failureReason
    });
    throw error;
  }
}

export async function resyncSyncfyCredential(input: {
  userId: string;
  providerCredentialId: string;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
}): Promise<SyncfyResyncSummary> {
  const connection = await prisma.providerConnection.findFirst({
    where: {
      userId: input.userId,
      provider: "syncfy",
      providerCredentialId: input.providerCredentialId
    },
    select: { id: true }
  });

  if (!connection) {
    throw new HttpError(404, "Syncfy credential connection was not found");
  }

  console.info("[SYNCFY REFRESH] Starting credential refresh fallback", {
    providerCredentialId: input.providerCredentialId,
    userId: input.userId
  });

  return resyncSyncfyConnection({
    userId: input.userId,
    connectionId: connection.id,
    timeoutMs: input.timeoutMs,
    retryDelaysMs: input.retryDelaysMs
  });
}

export function getManualSyncfyRefreshRetryDelaysMs() {
  return [...manualSyncfyRefreshRetryDelaysMs];
}

export async function markSyncfyWebhookEventFailed(
  eventId: string,
  error: unknown
) {
  const message = error instanceof Error ? error.message : "Unknown error";

  console.error("[SYNCFY WEBHOOK] Processing failed", {
    eventId,
    error: message
  });

  await prisma.providerWebhookEvent.update({
    where: { id: eventId },
    data: {
      status: "failed",
      processedAt: new Date(),
      errorMessage: message.slice(0, 1000)
    }
  });
}
