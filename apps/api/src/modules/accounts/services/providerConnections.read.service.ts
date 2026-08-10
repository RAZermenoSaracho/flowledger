import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import { HttpError } from "../../../utils/httpError.js";
import type { ProviderAccountListRecord } from "../types/accounts.types.js";
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

/** Lists provider connectors across all registered providers, stripped of internal metadata. */
export async function listConnectors() {
  const connectors = await listAvailableConnectors();
  return connectors.map(({ metadata: _metadata, ...connector }) => connector);
}

/** Lists provider institutions across all registered providers, filtered by query/country/category. */
export async function listInstitutions(filters: InstitutionCatalogQuery) {
  const institutions = await listAvailableInstitutions();
  return filterInstitutions(institutions, filters);
}

/** Reads a provider connection's current sync status plus its most recent webhook event, scoped to `userId`. */
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

const providerAccountsSieve = createSieve(prisma.providerAccount);

/** Lists a user's provider accounts (most recent 50), optionally restricted to unlinked ones via `filters.status === "unlinked"`. */
export async function listProviderAccounts(
  userId: string,
  filters: { status?: string }
) {
  const result = await providerAccountsSieve.query<ProviderAccountListRecord>({
    where: {
      and: [
        { field: "userId", op: "=", value: userId },
        ...(filters.status === "unlinked"
          ? [{ field: "accountId", op: "isNull" as const }]
          : [])
      ]
    },
    sort: [{ field: "createdAt", direction: "desc" }],
    pagination: { kind: "offset", page: 1, pageSize: 50 },
    include: { account: true, connection: true }
  });

  return result.data.map(providerAccountSummary);
}
