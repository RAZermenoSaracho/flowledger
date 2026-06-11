import { env } from "../../../config/env.js";
import { HttpError } from "../../../utils/httpError.js";
import type { FinancialProviderAdapter } from "../provider.types.js";
import {
  createSyncfySession,
  fetchSyncfyAccounts,
  fetchSyncfyTransactions,
  getOrCreateSyncfyUserForFlowLedgerUser,
  markSyncfyWebhookEventFailed,
  normalizeSyncfyAccount,
  normalizeSyncfyTransaction,
  processSyncfyWebhookEvent,
  type SyncfyWebhookEventInput
} from "./syncfy.service.js";

function buildSyncfyWidgetConfig() {
  return {
    locale: "es",
    entrypoint: {
      country: "MX",
      siteOrganizationType: "56cf4f5b784806cf028b4568"
    },
    navigation: {
      displayStatusInToast: true
    }
  };
}

export const syncfyProvider: FinancialProviderAdapter<SyncfyWebhookEventInput> =
  {
    key: "syncfy",
    displayName: "Syncfy",

    listConnectors: async () => [
      {
        provider: "syncfy",
        connectorId: "syncfy-mx",
        title: "Syncfy México",
        description: "Mexican banks and financial institutions",
        helperText:
          "Select Syncfy to open the secure provider widget and choose your institution there.",
        country: "MX",
        category: "bank",
        coverageLabel: "Mexico",
        metadata: {
          coverage: "mexico"
        }
      }
    ],

    listInstitutions: async () => [],

    createUser: async ({ externalUserId }) => {
      const user = await getOrCreateSyncfyUserForFlowLedgerUser(externalUserId);

      return {
        provider: "syncfy",
        providerUserId: user.idUser,
        externalUserId: user.externalUserId,
        rawData: user.rawData
      };
    },

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

    createConnectionFlow: async ({ providerUserId, externalUserId }) => {
      const flowLedgerUserId = providerUserId || externalUserId;

      if (!flowLedgerUserId) {
        throw new HttpError(
          400,
          "Syncfy connection requires a FlowLedger user"
        );
      }

      const syncfyUser =
        await getOrCreateSyncfyUserForFlowLedgerUser(flowLedgerUserId);
      const session = await createSyncfySession(syncfyUser.idUser);
      const config = buildSyncfyWidgetConfig();

      return {
        provider: "syncfy",
        token: session.token,
        widget: {
          token: session.token,
          config,
          scriptUrl: env.SYNCFY_WIDGET_SCRIPT_URL,
          styleUrl: env.SYNCFY_WIDGET_STYLE_URL
        },
        rawData: {
          syncfyUserId: syncfyUser.idUser,
          syncfyExternalUserId: syncfyUser.externalUserId,
          widgetConfig: config
        }
      };
    },

    handleWebhook: async ({ eventId, payload }) => {
      if (!eventId) {
        throw new HttpError(400, "Syncfy webhook processing requires event id");
      }

      try {
        const summary = await processSyncfyWebhookEvent(eventId, payload);

        return {
          status: summary.status,
          importedAccounts: summary.importedAccounts,
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

      const accounts = await fetchSyncfyAccounts(
        endpoint,
        sessionToken,
        providerCredentialId
      );

      return accounts.map((account) => ({
        provider: "syncfy",
        providerAccountId: account.syncfyAccountId,
        providerCredentialId: account.syncfyCredentialId,
        name: account.name,
        type: account.type,
        currency: account.currency,
        balance: account.balance,
        rawData: account.rawData
      }));
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

      const transactions = await fetchSyncfyTransactions(
        endpoint,
        sessionToken,
        providerCredentialId
      );

      return transactions.map((transaction) => ({
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
      }));
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