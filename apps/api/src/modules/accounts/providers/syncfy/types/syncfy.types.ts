import type { summarizeSyncfyEndpoints } from "../utils/syncfyEndpoints.js";

export type JsonRecord = Record<string, unknown>;

export type SyncfyWebhookEventInput = {
  header: {
    event: {
      eid?: string;
      name?: string;
    };
    user: {
      id_user?: string;
      id_external?: string;
    };
  };
  payload: {
    id_credential?: string;
    endpoints?: unknown;
  } & JsonRecord;
};

export type NormalizedSyncfyTransaction = {
  syncfyTransactionId: string;
  syncfyCredentialId: string;
  syncfyAccountId: string;
  description: string;
  amount: number;
  currency: string;
  transactionDate: Date;
  refreshDate: Date;
  rawData: JsonRecord;
};

export type NormalizedSyncfyAccount = {
  syncfyAccountId: string;
  syncfyCredentialId?: string;
  name: string;
  type?: string;
  currency?: string;
  balance?: number;
  rawData: JsonRecord;
};

export type NormalizedSyncfyInstitution = {
  syncfyInstitutionId: string;
  name: string;
  logoUrl?: string;
  country?: string;
  category: string;
  supportedAccountTypes: string[];
  rawData: JsonRecord;
};

export type SyncfyUser = {
  idUser: string;
  externalUserId?: string;
  name?: string;
  rawData: JsonRecord;
};

export type SyncfyProcessingSummary = {
  status: "processed" | "ignored";
  importedAccounts: number;
  importedTransactions: number;
  insertedOrUpdatedImportedTransactions?: number;
  skippedDuplicateTransactions?: number;
  refreshAttemptCount?: number;
  balanceFingerprint?: string;
};

export type SyncfyResyncSummary = {
  status: "processed" | "manual_reconnect_required";
  importedAccounts: number;
  importedTransactions: number;
  requiresManualReconnect: boolean;
  insertedOrUpdatedImportedTransactions?: number;
  skippedDuplicateTransactions?: number;
  refreshAttemptCount?: number;
  failureReason?: string;
};

export type StoredSyncfyRefreshMetadata = {
  provider: "syncfy";
  providerCredentialId: string;
  providerUserId: string;
  endpoints: unknown;
  storedAt: string;
  updatedAt: string;
  endpointSummary: ReturnType<typeof summarizeSyncfyEndpoints>;
};
