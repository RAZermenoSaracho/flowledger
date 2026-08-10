import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import {
  getManualSyncfyRefreshRetryDelaysMs,
  resyncSyncfyConnection,
  resyncSyncfyCredential
} from "../providers/syncfy/services/update.service.js";

/** Resyncs all accounts under a Syncfy provider connection owned by `userId`; throws 501 for any other provider. */
export async function resyncConnection(userId: string, connectionId: string) {
  const connection = await prisma.providerConnection.findFirst({
    where: {
      id: connectionId,
      userId
    }
  });

  if (!connection) {
    throw new HttpError(404, "Provider connection was not found");
  }

  if (connection.provider !== "syncfy") {
    throw new HttpError(501, "Provider resync is not configured");
  }

  return resyncSyncfyConnection({
    userId,
    connectionId: connection.id,
    retryDelaysMs: getManualSyncfyRefreshRetryDelaysMs()
  });
}

/** Manually triggers a Syncfy credential refresh, bypassing the auto-sync scheduler's cadence. */
export async function refreshSyncfyCredential(
  userId: string,
  providerCredentialId: string
) {
  console.info("[SYNCFY REFRESH] Manual credential refresh requested", {
    providerCredentialId,
    userId
  });

  return resyncSyncfyCredential({
    userId,
    providerCredentialId,
    retryDelaysMs: getManualSyncfyRefreshRetryDelaysMs()
  });
}

/** Resyncs the Syncfy connection backing a single linked provider account owned by `userId`. */
export async function resyncProviderAccount(userId: string, accountId: string) {
  const providerAccount = await prisma.providerAccount.findFirst({
    where: {
      id: accountId,
      userId,
      accountId: { not: null }
    },
    include: { connection: true }
  });

  if (!providerAccount) {
    throw new HttpError(404, "Synced account was not found");
  }
  if (!providerAccount.connection) {
    throw new HttpError(409, "Synced account is missing a connection");
  }

  if (providerAccount.provider !== "syncfy") {
    throw new HttpError(501, "Provider resync is not configured");
  }

  return resyncSyncfyConnection({
    userId,
    connectionId: providerAccount.connection.id,
    retryDelaysMs: getManualSyncfyRefreshRetryDelaysMs()
  });
}
