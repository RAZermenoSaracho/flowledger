import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import {
  filterInstitutions,
  listAvailableConnectors,
  listAvailableInstitutions
} from "../utils/institutionCatalog.js";
import { providerAccountSummary } from "../utils/providerAccountMetadata.js";

type InstitutionCatalogQuery = {
  q?: string;
  provider?: string;
  country?: string;
  category?: string;
};

export async function listConnectors() {
  const connectors = await listAvailableConnectors();
  return connectors.map(({ metadata: _metadata, ...connector }) => connector);
}

export async function listInstitutions(filters: InstitutionCatalogQuery) {
  const institutions = await listAvailableInstitutions();
  return filterInstitutions(institutions, filters);
}

export async function getConnectionStatus(userId: string, connectionId: string) {
  const connection = await prisma.providerConnection.findFirst({
    where: {
      id: connectionId,
      userId
    },
    include: {
      _count: {
        select: {
          accounts: true,
          importedTransactions: true
        }
      }
    }
  });

  if (!connection) {
    throw new HttpError(404, "Provider connection was not found");
  }

  const latestWebhookEvent = await prisma.providerWebhookEvent.findFirst({
    where: {
      provider: connection.provider,
      providerCredentialId: connection.providerCredentialId
    },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      eventName: true,
      status: true,
      errorMessage: true,
      receivedAt: true,
      processedAt: true
    }
  });

  return {
    id: connection.id,
    provider: connection.provider,
    institutionId: connection.institutionId,
    institutionName: connection.institutionName,
    status: connection.status,
    failureReason: connection.failureReason,
    requiresManualReconnect: connection.requiresManualReconnect,
    lastSyncAt: connection.lastSyncAt,
    lastSyncSuccessAt: connection.lastSyncSuccessAt,
    lastSyncFailureAt: connection.lastSyncFailureAt,
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
    accountsCount: connection._count.accounts,
    importedTransactionsCount: connection._count.importedTransactions,
    latestWebhookEvent
  };
}

export async function listProviderAccounts(
  userId: string,
  filters: { status?: string }
) {
  const accounts = await prisma.providerAccount.findMany({
    where: {
      userId,
      ...(filters.status === "unlinked" ? { accountId: null } : {})
    },
    include: {
      account: true,
      connection: true
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return accounts.map(providerAccountSummary);
}
