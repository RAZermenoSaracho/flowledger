import type { AccountInput, UpdateAccountInput } from "@flowledger/shared";
import type { SortDirection, WhereNode } from "../utils/searchDomain";
import { ApiError, apiRequest } from "./api.client";
import type {
  Account,
  AccountHoldings,
  HoldingIdentity,
  HoldingsChangeSet,
  Connector,
  Institution,
  ProviderImportedAccount,
  ProviderResyncResult
} from "../types/accounts.types";

export type { SortDirection };

/** The wire shape `GET /accounts` accepts — see apps/api's accounts read.service.ts. */
export type AccountsQuery = {
  where?: WhereNode;
  sort?: { field: string; direction: SortDirection }[];
};

/** Fetches the user's accounts for a DSQL query. */
export function listAccounts(query: AccountsQuery = {}) {
  return apiRequest<{ accounts: Account[] }>("/accounts", {
    query: { query: JSON.stringify(query) }
  });
}

/** Creates a manual (non-provider-linked) account. */
export function createAccount(body: AccountInput) {
  return apiRequest<{ account: Account }>("/accounts", {
    method: "POST",
    body
  });
}

/** Updates an account's fields; any subset may be sent. */
export function updateAccount(accountId: string, body: UpdateAccountInput) {
  return apiRequest<{ account: Account }>(`/accounts/${accountId}`, {
    method: "PUT",
    body
  });
}

/** Archives an account. */
export function archiveAccount(accountId: string) {
  return apiRequest<{ account: Account }>(`/accounts/${accountId}/archive`, {
    method: "POST"
  });
}

/** Restores an archived account. */
export function restoreAccount(accountId: string) {
  return apiRequest<{ account: Account }>(`/accounts/${accountId}/restore`, {
    method: "POST"
  });
}

/** Deletes an account. */
export function deleteAccount(accountId: string) {
  return apiRequest<void>(`/accounts/${accountId}`, { method: "DELETE" });
}

// Provider connections (Syncfy and future bank-sync providers) — owned by the
// accounts backend module since they exist to sync FlowLedger accounts.

/** Fetches available provider connectors (e.g. Syncfy). */
export function listProviderConnectors() {
  return apiRequest<{ connectors: Connector[] }>("/providers/connectors");
}

/** Fetches provider institutions matching a search/provider/country/category filter. */
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

/** Starts a provider connection flow for an institution or provider. */
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

/** Polls a provider connection flow's status until it completes or fails. */
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

/** Triggers a resync of an entire provider connection. */
export function resyncProviderConnection(connectionId: string) {
  return apiRequest<{ resync: ProviderResyncResult }>(
    `/providers/connections/${connectionId}/resync`,
    { method: "POST" }
  );
}

/** Manually triggers a Syncfy credential refresh. */
export function refreshSyncfyCredential(providerCredentialId: string) {
  return apiRequest<{ refresh: ProviderResyncResult }>(
    `/providers/syncfy/credentials/${providerCredentialId}/refresh`,
    { method: "POST" }
  );
}

/** Fetches provider accounts, optionally filtered to those not yet linked to a FlowLedger account. */
export function listProviderAccounts(params: { status?: "unlinked" } = {}) {
  return apiRequest<{ accounts: ProviderImportedAccount[] }>(
    "/providers/accounts",
    { query: params }
  );
}

/** Triggers a resync of a single provider account. */
export function resyncProviderAccount(providerAccountId: string) {
  return apiRequest<{ resync: ProviderResyncResult }>(
    `/providers/accounts/${providerAccountId}/resync`,
    { method: "POST" }
  );
}

/** Confirms which fetched provider accounts to link to existing or new FlowLedger accounts. */
export function confirmProviderAccounts(
  accounts: { providerAccountId: string; accountId?: string }[]
) {
  return apiRequest<{ accounts: ProviderImportedAccount[] }>(
    "/providers/accounts/confirm",
    { method: "POST", body: { accounts } }
  );
}

/** Fetches an account's holdings with their valuations and the aggregate. */
export function getAccountHoldings(accountId: string) {
  return apiRequest<AccountHoldings>(`/accounts/${accountId}/holdings`);
}

/** Applies one atomic holdings change set (upserts and removals by id); holdings not mentioned are untouched. A 409 `duplicate_holding` rejects with an `Error` carrying `duplicateHolding`, the instrument the account already holds. */
export async function updateAccountHoldings(
  accountId: string,
  body: HoldingsChangeSet
) {
  try {
    return await apiRequest<AccountHoldings>(`/accounts/${accountId}/holdings`, {
      method: "PATCH",
      body
    });
  } catch (error) {
    const conflict = error instanceof ApiError && error.status === 409
      ? (error.body as { code?: string; holding?: HoldingIdentity } | undefined)
      : undefined;
    if (conflict?.code === "duplicate_holding" && conflict.holding) {
      throw Object.assign(new Error((error as Error).message), { duplicateHolding: conflict.holding });
    }
    throw error;
  }
}

/** Refreshes the account's due provider-linked holdings and returns the same body as `getAccountHoldings`. Called once per Holdings tab mount. */
export function refreshHoldings(accountId: string) {
  return apiRequest<AccountHoldings>(
    `/accounts/${accountId}/holdings/refresh`,
    {
      method: "POST"
    }
  );
}
