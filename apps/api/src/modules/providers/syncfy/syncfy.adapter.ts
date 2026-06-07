import { HttpError } from "../../../utils/httpError.js";
import type { FinancialProviderAdapter } from "../provider.types.js";
import {
  createSyncfySession,
  fetchSyncfyAccounts,
  fetchSyncfyInstitutions,
  fetchSyncfyTransactions,
  markSyncfyWebhookEventFailed,
  normalizeSyncfyAccount,
  normalizeSyncfyTransaction,
  processSyncfyWebhookEvent,
  type SyncfyWebhookEventInput
} from "./syncfy.service.js";

function unsupported(capability: string): never {
  throw new HttpError(501, `Syncfy does not support ${capability} yet`);
}

export const syncfyProvider: FinancialProviderAdapter<SyncfyWebhookEventInput> =
  {
    key: "syncfy",
    displayName: "Syncfy",

    listInstitutions: async () =>
      fetchSyncfyInstitutions().then((institutions) =>
        institutions.map((institution) => ({
          provider: "syncfy",
          institutionId: institution.syncfyInstitutionId,
          name: institution.name,
          logoUrl: institution.logoUrl,
          country: institution.country,
          category: institution.category,
          supportedAccountTypes: institution.supportedAccountTypes,
          rawData: institution.rawData
        }))
      ),

    createUser: async () => unsupported("user creation"),

    createSession: async ({ providerUserId, externalUserId }) => {
      const idUser = providerUserId || externalUserId;
      if (!idUser) {
        throw new HttpError(400, "Syncfy session requires a provider user id");
      }

      const session = await createSyncfySession(idUser);
      return {
        provider: "syncfy",
        token: session.token
      };
    },

    createConnectionFlow: async () => unsupported("connection flow creation"),

    handleWebhook: async ({ eventId, payload }) => {
      if (!eventId) {
        throw new HttpError(400, "Syncfy webhook processing requires event id");
      }

      try {
        const summary = await processSyncfyWebhookEvent(eventId, payload);
        return {
          status: summary.status,
          importedTransactions: summary.importedTransactions
        };
      } catch (error) {
        await markSyncfyWebhookEventFailed(eventId, error);
        throw error;
      }
    },

    fetchAccounts: async ({ endpoint, sessionToken, providerCredentialId }) => {
      if (!endpoint || !sessionToken) {
        throw new HttpError(
          400,
          "Syncfy account fetching requires endpoint and session token"
        );
      }

      return fetchSyncfyAccounts(
        endpoint,
        sessionToken,
        providerCredentialId
      ).then((accounts) =>
        accounts.map((account) => ({
          provider: "syncfy",
          providerAccountId: account.syncfyAccountId,
          providerCredentialId: account.syncfyCredentialId,
          name: account.name,
          type: account.type,
          currency: account.currency,
          balance: account.balance,
          rawData: account.rawData
        }))
      );
    },

    fetchTransactions: async ({
      endpoint,
      sessionToken,
      providerCredentialId
    }) => {
      if (!endpoint || !sessionToken) {
        throw new HttpError(
          400,
          "Syncfy transaction fetching requires endpoint and session token"
        );
      }

      return fetchSyncfyTransactions(
        endpoint,
        sessionToken,
        providerCredentialId
      ).then((transactions) =>
        transactions.map((transaction) => ({
          provider: "syncfy",
          providerTransactionId: transaction.syncfyTransactionId,
          providerCredentialId: transaction.syncfyCredentialId,
          providerAccountId: transaction.syncfyAccountId,
          description: transaction.description,
          amount: transaction.amount,
          currency: transaction.currency,
          transactionDate: transaction.transactionDate,
          refreshDate: transaction.refreshDate,
          rawData: transaction.rawData
        }))
      );
    },

    normalizeAccount: ({ account, fallbackCredentialId }) => {
      const normalized = normalizeSyncfyAccount(account, fallbackCredentialId);

      return {
        provider: "syncfy",
        providerAccountId: normalized.syncfyAccountId,
        providerCredentialId: normalized.syncfyCredentialId,
        name: normalized.name,
        type: normalized.type,
        currency: normalized.currency,
        balance: normalized.balance,
        rawData: normalized.rawData
      };
    },

    normalizeTransaction: ({ transaction, fallbackCredentialId }) => {
      const normalized = normalizeSyncfyTransaction(
        transaction,
        fallbackCredentialId
      );

      return {
        provider: "syncfy",
        providerTransactionId: normalized.syncfyTransactionId,
        providerCredentialId: normalized.syncfyCredentialId,
        providerAccountId: normalized.syncfyAccountId,
        description: normalized.description,
        amount: normalized.amount,
        currency: normalized.currency,
        transactionDate: normalized.transactionDate,
        refreshDate: normalized.refreshDate,
        rawData: normalized.rawData
      };
    }
  };

export { markSyncfyWebhookEventFailed };
