import { Prisma } from "@prisma/client";
import { prisma } from "../../../../../db/prisma.js";
import { HttpError } from "../../../../../utils/httpError.js";
import type {
  NormalizedSyncfyAccount,
  NormalizedSyncfyTransaction,
  SyncfyProcessingSummary,
  SyncfyWebhookEventInput
} from "../types/syncfy.types.js";
import { toJsonValue } from "../utils/syncfyHttp.js";
import {
  buildSyncfyProviderAccountMetadata,
  buildSyncfyRefreshMetadata,
  countNewSyncfyImportedTransactionIds,
  getEndpointSummary,
  getSyncfyEndpointList,
  providerAccountKey,
  resolveSyncfyImportedTransactionStatus,
  summarizeSyncfyEndpoints,
  summarizeSyncfyImportedTransactionWrites,
  syncfyBalanceFingerprint
} from "../utils/syncfyEndpoints.js";
import {
  createSyncfySession,
  fetchSyncfyAccounts,
  fetchSyncfyTransactions
} from "../syncfy.client.js";

async function findFlowLedgerUserIdForSyncfyUser(syncfyUserId: string) {
  const mapping = await prisma.userAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "syncfy",
        providerAccountId: syncfyUserId
      }
    },
    select: { userId: true }
  });

  return mapping?.userId;
}

async function findFlowLedgerUserIdForSyncfyCredential(
  syncfyCredentialId: string
) {
  const connection = await prisma.providerConnection.findUnique({
    where: {
      provider_providerCredentialId: {
        provider: "syncfy",
        providerCredentialId: syncfyCredentialId
      }
    },
    select: { userId: true }
  });

  return connection?.userId;
}

async function upsertProviderConnection(input: {
  userId: string;
  providerUserId: string;
  providerCredentialId: string;
  endpoints: unknown;
}) {
  const now = new Date();
  const refreshMetadata = buildSyncfyRefreshMetadata({
    providerCredentialId: input.providerCredentialId,
    providerUserId: input.providerUserId,
    endpoints: input.endpoints,
    now
  });
  const endpointSummary = getEndpointSummary(refreshMetadata.endpoints);

  return prisma.providerConnection.upsert({
    where: {
      provider_providerCredentialId: {
        provider: "syncfy",
        providerCredentialId: input.providerCredentialId
      }
    },
    create: {
      userId: input.userId,
      provider: "syncfy",
      providerUserId: input.providerUserId,
      providerCredentialId: input.providerCredentialId,
      status: "active",
      failureReason: null,
      requiresManualReconnect: false,
      lastSyncAt: now,
      lastSyncSuccessAt: now,
      lastSyncFailureAt: null,
      rawData: toJsonValue({
        id_credential: input.providerCredentialId,
        syncfyRefreshMetadata: refreshMetadata,
        ...endpointSummary
      })
    },
    update: {
      userId: input.userId,
      providerUserId: input.providerUserId,
      status: "active",
      failureReason: null,
      requiresManualReconnect: false,
      lastSyncAt: now,
      lastSyncSuccessAt: now,
      lastSyncFailureAt: null,
      rawData: toJsonValue({
        id_credential: input.providerCredentialId,
        syncfyRefreshMetadata: refreshMetadata,
        ...endpointSummary
      })
    }
  });
}

async function upsertProviderAccounts(input: {
  userId: string;
  connectionId: string;
  providerUserId: string;
  accounts: NormalizedSyncfyAccount[];
}) {
  const refs = new Map<string, string>();
  const now = new Date();

  for (const account of input.accounts) {
    if (!account.syncfyCredentialId) {
      throw new HttpError(502, "Syncfy account is missing id_credential");
    }

    const providerAccount = await prisma.providerAccount.upsert({
      where: {
        provider_providerCredentialId_providerAccountId: {
          provider: "syncfy",
          providerCredentialId: account.syncfyCredentialId,
          providerAccountId: account.syncfyAccountId
        }
      },
      create: {
        userId: input.userId,
        connectionId: input.connectionId,
        provider: "syncfy",
        providerUserId: input.providerUserId,
        providerCredentialId: account.syncfyCredentialId,
        providerAccountId: account.syncfyAccountId,
        accountMetadata: toJsonValue(buildSyncfyProviderAccountMetadata(account)),
        status: "active",
        failureReason: null,
        requiresManualReconnect: false,
        lastSyncAt: now,
        lastSyncSuccessAt: now,
        lastSyncFailureAt: null,
        rawData: account.rawData as Prisma.InputJsonObject
      },
      update: {
        userId: input.userId,
        connectionId: input.connectionId,
        providerUserId: input.providerUserId,
        accountMetadata: toJsonValue(buildSyncfyProviderAccountMetadata(account)),
        status: "active",
        failureReason: null,
        requiresManualReconnect: false,
        lastSyncAt: now,
        lastSyncSuccessAt: now,
        lastSyncFailureAt: null,
        rawData: account.rawData as Prisma.InputJsonObject
      },
      select: {
        id: true,
        providerCredentialId: true,
        providerAccountId: true
      }
    });

    refs.set(
      providerAccountKey(
        providerAccount.providerCredentialId,
        providerAccount.providerAccountId
      ),
      providerAccount.id
    );
  }

  return refs;
}

async function findProviderAccountRefs(input: {
  providerCredentialId: string;
  providerAccountIds: string[];
}) {
  if (input.providerAccountIds.length === 0) return new Map<string, string>();

  const accounts = await prisma.providerAccount.findMany({
    where: {
      provider: "syncfy",
      providerCredentialId: input.providerCredentialId,
      providerAccountId: { in: Array.from(new Set(input.providerAccountIds)) }
    },
    select: {
      id: true,
      providerCredentialId: true,
      providerAccountId: true
    }
  });

  return new Map(
    accounts.map((account) => [
      providerAccountKey(
        account.providerCredentialId,
        account.providerAccountId
      ),
      account.id
    ])
  );
}

async function fetchAccountsFromEndpoints(input: {
  endpoints: string[];
  token: string;
  fallbackCredentialId?: string;
}) {
  const accounts: NormalizedSyncfyAccount[] = [];

  for (const endpoint of input.endpoints) {
    accounts.push(
      ...(await fetchSyncfyAccounts(
        endpoint,
        input.token,
        input.fallbackCredentialId
      ))
    );
  }

  return accounts;
}

async function fetchTransactionsFromEndpoints(input: {
  endpoints: string[];
  token: string;
  fallbackCredentialId?: string;
}) {
  const transactions: NormalizedSyncfyTransaction[] = [];

  for (const endpoint of input.endpoints) {
    transactions.push(
      ...(await fetchSyncfyTransactions(
        endpoint,
        input.token,
        input.fallbackCredentialId
      ))
    );
  }

  return transactions;
}

async function getExistingImportedTransactionIds(input: {
  provider: string;
  providerTransactionIds: string[];
}) {
  if (input.providerTransactionIds.length === 0) return new Set<string>();

  const rows = await prisma.providerImportedTransaction.findMany({
    where: {
      provider: input.provider,
      providerTransactionId: {
        in: Array.from(new Set(input.providerTransactionIds))
      }
    },
    select: {
      providerTransactionId: true
    }
  });

  return new Set(rows.map((row) => row.providerTransactionId));
}

async function notifyNewImportedTransactions(input: {
  userId: string;
  providerCredentialId: string;
  newTransactionsCount: number;
}) {
  if (input.newTransactionsCount <= 0) return;

  const pendingCount = await prisma.providerImportedTransaction.count({
    where: { userId: input.userId, status: "pending" }
  });
  const existing = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      type: "provider_transactions_pending",
      readAt: null
    }
  });
  const data = {
    title: "Imported transactions pending review",
    message: `You have ${pendingCount} imported transaction${
      pendingCount === 1 ? "" : "s"
    } pending review.`,
    metadata: toJsonValue({
      provider: "syncfy",
      providerCredentialId: input.providerCredentialId,
      pendingCount
    })
  };

  if (existing) {
    await prisma.notification.update({
      where: { id: existing.id },
      data
    });
    return;
  }

  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: "provider_transactions_pending",
      ...data
    }
  });
}

export async function processSyncfyCredentialRefresh(input: {
  eventId?: string;
  idUser: string;
  userId?: string;
  providerCredentialId?: string;
  endpoints: unknown;
}) {
  const accountEndpoints = getSyncfyEndpointList(input.endpoints, "accounts");
  const transactionEndpoints = getSyncfyEndpointList(
    input.endpoints,
    "transactions"
  );
  const endpointSummary = summarizeSyncfyEndpoints(input.endpoints);

  console.info("[SYNCFY IMPORT] Processing credential refresh", {
    eventId: input.eventId,
    providerCredentialId: input.providerCredentialId,
    endpointTypes: endpointSummary.endpointTypes,
    accountEndpointCount: endpointSummary.accountEndpointCount,
    transactionEndpointCount: endpointSummary.transactionEndpointCount
  });

  if (accountEndpoints.length === 0 && transactionEndpoints.length === 0) {
    if (input.eventId) {
      await prisma.providerWebhookEvent.update({
        where: { id: input.eventId },
        data: {
          status: "processed",
          processedAt: new Date()
        }
      });
    }

    return {
      status: "processed" as const,
      importedAccounts: 0,
      importedTransactions: 0,
      insertedOrUpdatedImportedTransactions: 0,
      skippedDuplicateTransactions: 0,
      refreshAttemptCount: 1,
      balanceFingerprint: syncfyBalanceFingerprint([])
    };
  }

  const { token } = await createSyncfySession(input.idUser);

  const accounts = await fetchAccountsFromEndpoints({
    endpoints: accountEndpoints,
    token,
    fallbackCredentialId: input.providerCredentialId
  });

  const transactions = await fetchTransactionsFromEndpoints({
    endpoints: transactionEndpoints,
    token,
    fallbackCredentialId: input.providerCredentialId
  });

  const existingTransactionIds = await getExistingImportedTransactionIds({
    provider: "syncfy",
    providerTransactionIds: transactions.map(
      (transaction) => transaction.syncfyTransactionId
    )
  });

  const newTransactionsCount = countNewSyncfyImportedTransactionIds({
    existingTransactionIds,
    transactions
  });
  const transactionWriteSummary = summarizeSyncfyImportedTransactionWrites({
    existingTransactionIds,
    transactions
  });
  const balanceFingerprint = syncfyBalanceFingerprint(accounts);

  const providerCredentialId =
    input.providerCredentialId ??
    accounts.find((account) => account.syncfyCredentialId)
      ?.syncfyCredentialId ??
    transactions[0]?.syncfyCredentialId;

  if (!providerCredentialId) {
    throw new HttpError(502, "Syncfy event is missing id_credential");
  }

  const userId =
    input.userId ??
    (await findFlowLedgerUserIdForSyncfyUser(input.idUser)) ??
    (await findFlowLedgerUserIdForSyncfyCredential(providerCredentialId));

  if (!userId) {
    throw new HttpError(404, "FlowLedger user was not found for Syncfy event");
  }

  console.info("[SYNCFY IMPORT] Fetched provider data", {
    eventId: input.eventId,
    providerCredentialId,
    userId,
    importedAccountCount: accounts.length,
    importedTransactionCount: transactions.length,
    fetchedAccountsCount: accounts.length,
    fetchedTransactionsCount: transactions.length,
    newTransactionCount: newTransactionsCount,
    insertedOrUpdatedImportedTransactionsCount:
      transactionWriteSummary.insertedOrUpdatedImportedTransactions,
    skippedDuplicateTransactionsCount:
      transactionWriteSummary.skippedDuplicateTransactions
  });

  if (transactions.length === 0) {
    console.info("[SYNCFY IMPORT] Transaction endpoint returned no rows", {
      eventId: input.eventId,
      providerCredentialId,
      accountEndpointCount: accountEndpoints.length,
      transactionEndpointCount: transactionEndpoints.length,
      fetchedAccountsCount: accounts.length,
      fetchedTransactionsCount: transactions.length
    });
  }

  const connection = await upsertProviderConnection({
    userId,
    providerUserId: input.idUser,
    providerCredentialId,
    endpoints: input.endpoints
  });

  const accountRefs = await upsertProviderAccounts({
    userId,
    connectionId: connection.id,
    providerUserId: input.idUser,
    accounts
  });

  const existingAccountRefs = await findProviderAccountRefs({
    providerCredentialId,
    providerAccountIds: transactions.map(
      (transaction) => transaction.syncfyAccountId
    )
  });

  for (const [key, value] of existingAccountRefs) {
    accountRefs.set(key, value);
  }

  for (const transaction of transactions) {
    if (existingTransactionIds.has(transaction.syncfyTransactionId)) {
      continue;
    }

    const providerAccountRefId = accountRefs.get(
      providerAccountKey(
        transaction.syncfyCredentialId,
        transaction.syncfyAccountId
      )
    );

    try {
      await prisma.providerImportedTransaction.create({
        data: {
          userId,
          connectionId: connection.id,
          providerAccountRefId,
          provider: "syncfy",
          providerUserId: input.idUser,
          providerTransactionId: transaction.syncfyTransactionId,
          providerCredentialId: transaction.syncfyCredentialId,
          providerAccountId: transaction.syncfyAccountId,
          description: transaction.description,
          amount: new Prisma.Decimal(transaction.amount),
          currency: transaction.currency,
          transactionDate: transaction.transactionDate,
          refreshDate: transaction.refreshDate,
          status: resolveSyncfyImportedTransactionStatus({}),
          errorMessage: null,
          rawData: transaction.rawData as Prisma.InputJsonObject
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  if (transactions.length > 0) {
    await prisma.providerImportedTransaction.updateMany({
      where: {
        provider: "syncfy",
        providerTransactionId: {
          in: transactions.map((transaction) => transaction.syncfyTransactionId)
        },
        status: "imported",
        transactionId: null
      },
      data: {
        status: "pending",
        errorMessage: null
      }
    });

    await prisma.providerImportedTransaction.updateMany({
      where: {
        provider: "syncfy",
        providerTransactionId: {
          in: transactions.map((transaction) => transaction.syncfyTransactionId)
        },
        status: "imported",
        transactionId: { not: null }
      },
      data: {
        status: "processed",
        errorMessage: null
      }
    });
  }

  /*
    Existing providerTransactionId rows are intentionally not rewritten here.
    Their status/category/transaction link represent user review decisions.
  */
  /*
    Kept as explicit variables for operational logs and API summaries.
  */
  const insertedOrUpdatedImportedTransactions =
    transactionWriteSummary.insertedOrUpdatedImportedTransactions;
  const skippedDuplicateTransactions =
    transactionWriteSummary.skippedDuplicateTransactions;

  await notifyNewImportedTransactions({
    userId,
    providerCredentialId,
    newTransactionsCount
  });

  if (input.eventId) {
    await prisma.providerWebhookEvent.update({
      where: { id: input.eventId },
      data: {
        status: "processed",
        processedAt: new Date(),
        errorMessage: null
      }
    });
  }

  return {
    status: "processed" as const,
    importedAccounts: accounts.length,
    importedTransactions: transactions.length,
    insertedOrUpdatedImportedTransactions,
    skippedDuplicateTransactions,
    refreshAttemptCount: 1,
    balanceFingerprint
  };
}

export async function processSyncfyWebhookEvent(
  eventId: string,
  event: SyncfyWebhookEventInput
): Promise<SyncfyProcessingSummary> {
  const claimResult = await prisma.providerWebhookEvent.updateMany({
    where: {
      id: eventId,
      status: "received"
    },
    data: {
      status: "processing",
      processedAt: null,
      errorMessage: null
    }
  });

  if (claimResult.count === 0) {
    return {
      status: "ignored",
      importedAccounts: 0,
      importedTransactions: 0,
      insertedOrUpdatedImportedTransactions: 0,
      skippedDuplicateTransactions: 0
    };
  }

  if (event.header.event.name !== "credentials.refreshed") {
    console.info("[SYNCFY WEBHOOK] Ignoring unsupported event", {
      eventId,
      eventName: event.header.event.name ?? "unknown",
      providerCredentialId: event.payload.id_credential
    });

    await prisma.providerWebhookEvent.update({
      where: { id: eventId },
      data: {
        status: "ignored",
        processedAt: new Date()
      }
    });

    return {
      status: "ignored",
      importedAccounts: 0,
      importedTransactions: 0,
      insertedOrUpdatedImportedTransactions: 0,
      skippedDuplicateTransactions: 0
    };
  }

  const idUser = event.header.user.id_user;
  if (!idUser) throw new HttpError(400, "Syncfy event is missing id_user");

  console.info("[SYNCFY WEBHOOK] Processing event", {
    eventId,
    eventName: event.header.event.name,
    providerCredentialId: event.payload.id_credential
  });

  return processSyncfyCredentialRefresh({
    eventId,
    idUser,
    providerCredentialId: event.payload.id_credential,
    endpoints: event.payload.endpoints
  });
}
