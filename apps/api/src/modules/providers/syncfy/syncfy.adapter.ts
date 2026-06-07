import { HttpError } from "../../../utils/httpError.js";
import { env } from "../../../config/env.js";
import type { FinancialProviderAdapter } from "../provider.types.js";
import {
  createSyncfySession,
  fetchSyncfyAccounts,
  fetchSyncfyInstitutions,
  fetchSyncfyTransactions,
  getOrCreateSyncfyUserForFlowLedgerUser,
  markSyncfyWebhookEventFailed,
  normalizeSyncfyAccount,
  normalizeSyncfyTransaction,
  processSyncfyWebhookEvent,
  type SyncfyWebhookEventInput
} from "./syncfy.service.js";

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function getCountryCode(
  rawData: Record<string, unknown> | undefined,
  fallbackCountry: unknown
) {
  const country = getRecord(rawData?.country);
  const value =
    getString(rawData?.country_code) ??
    getString(country?.code) ??
    getString(fallbackCountry) ??
    getString(rawData?.country);

  return value && value.length <= 3 ? value.toUpperCase() : undefined;
}

function buildSyncfyWidgetConfig(input: {
  institutionId?: string;
  metadata?: Record<string, unknown>;
}) {
  const institution = getRecord(input.metadata?.institution);
  const rawData = getRecord(institution?.rawData);
  const country = getCountryCode(rawData, institution?.country);
  const entrypoint = {
    ...(country ? { country } : {}),
    ...(input.institutionId ? { site: input.institutionId } : {})
  };

  return {
    locale: "en",
    ...(Object.keys(entrypoint).length > 0 ? { entrypoint } : {}),
    navigation: {
      enableBackNavigation: !input.institutionId,
      hideSelectCountry: Boolean(country),
      oneSiteFlow: Boolean(input.institutionId),
      displayStatusInToast: false
    }
  };
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

    createConnectionFlow: async ({
      providerUserId,
      externalUserId,
      ...input
    }) => {
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
      const config = buildSyncfyWidgetConfig(input);

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
