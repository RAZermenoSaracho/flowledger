import { apiRequest } from "./api.client";
import type {
  Account,
  Connector,
  Institution,
  ProviderImportedAccount
} from "../types/accounts.types";
import type { AccountType } from "@flowledger/shared";

export type AccountSortBy = "name" | "createdAt" | "updatedAt";
export type SortDirection = "asc" | "desc";

export function listAccounts(
  params: {
    includeArchived?: boolean;
    sortBy?: AccountSortBy;
    sortDirection?: SortDirection;
    types?: AccountType[];
    sources?: ("manual" | "synced")[];
  } = {}
) {
  return apiRequest<{ accounts: Account[] }>("/accounts", {
    query: {
      includeArchived: params.includeArchived ? "true" : undefined,
      sortBy: params.sortBy,
      sortDirection: params.sortDirection,
      types: params.types,
      sources: params.sources
    }
  });
}

export function createAccount(body: {
  name: string;
  type: AccountType;
  identifier?: string | null;
  currency: string;
  initialBalance: number;
}) {
  return apiRequest<{ account: Account }>("/accounts", {
    method: "POST",
    body
  });
}

export function updateAccount(
  accountId: string,
  body: {
    name: string;
    type: AccountType;
    identifier?: string | null;
    currency: string;
    initialBalance: number;
  }
) {
  return apiRequest<{ account: Account }>(`/accounts/${accountId}`, {
    method: "PUT",
    body
  });
}

export function archiveAccount(accountId: string) {
  return apiRequest<{ account: Account }>(`/accounts/${accountId}/archive`, {
    method: "POST"
  });
}

export function restoreAccount(accountId: string) {
  return apiRequest<{ account: Account }>(`/accounts/${accountId}/restore`, {
    method: "POST"
  });
}

export function deleteAccount(accountId: string) {
  return apiRequest<void>(`/accounts/${accountId}`, { method: "DELETE" });
}

// Provider connections (Syncfy and future bank-sync providers) — owned by the
// accounts backend module since they exist to sync FlowLedger accounts.

export function listProviderConnectors() {
  return apiRequest<{ connectors: Connector[] }>("/providers/connectors");
}

export function listProviderInstitutions(
  params: {
    q?: string;
    provider?: string;
    country?: string;
    category?: string;
  } = {}
) {
  return apiRequest<{ institutions: Institution[] }>(
    "/providers/institutions",
    {
      query: params
    }
  );
}

export function createProviderConnection(body: {
  institutionId?: string;
  provider?: string;
}) {
  return apiRequest<{
    connection: {
      provider: string;
      connectorId?: string;
      institutionId?: string;
      institutionName: string;
      flowId?: string;
      token?: string;
      url?: string;
      widget?: {
        token: string;
        config: Record<string, unknown>;
        scriptUrl?: string;
        styleUrl?: string;
      };
    };
  }>("/providers/connections", { method: "POST", body });
}

export function getProviderConnectionStatus(connectionId: string) {
  return apiRequest<{
    connection: {
      id: string;
      provider: string;
      institutionId?: string | null;
      institutionName?: string | null;
      status: string;
      failureReason?: string | null;
      requiresManualReconnect: boolean;
      accountsCount: number;
      importedTransactionsCount: number;
    };
  }>(`/providers/connections/${connectionId}/status`);
}

export type ProviderResyncResult = {
  status: string;
  importedAccounts: number;
  importedTransactions: number;
  requiresManualReconnect?: boolean;
  failureReason?: string;
};

export function resyncProviderConnection(connectionId: string) {
  return apiRequest<{ resync: ProviderResyncResult }>(
    `/providers/connections/${connectionId}/resync`,
    { method: "POST" }
  );
}

export function refreshSyncfyCredential(providerCredentialId: string) {
  return apiRequest<{ refresh: ProviderResyncResult }>(
    `/providers/syncfy/credentials/${providerCredentialId}/refresh`,
    { method: "POST" }
  );
}

export function listProviderAccounts(params: { status?: "unlinked" } = {}) {
  return apiRequest<{ accounts: ProviderImportedAccount[] }>(
    "/providers/accounts",
    { query: params }
  );
}

export function resyncProviderAccount(providerAccountId: string) {
  return apiRequest<{ resync: ProviderResyncResult }>(
    `/providers/accounts/${providerAccountId}/resync`,
    { method: "POST" }
  );
}

export function confirmProviderAccounts(
  accounts: { providerAccountId: string; accountId?: string }[]
) {
  return apiRequest<{ accounts: ProviderImportedAccount[] }>(
    "/providers/accounts/confirm",
    { method: "POST", body: { accounts } }
  );
}
