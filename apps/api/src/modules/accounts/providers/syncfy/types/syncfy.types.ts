import type { summarizeSyncfyEndpoints } from "../utils/syncfyEndpoints.js";

/** Generic alias for an untyped JSON object, used throughout this module for Syncfy payloads before they're normalized. */
export type JsonRecord = Record<string, unknown>;

/** Outcome of verifying a Syncfy webhook's HMAC signature: `"skipped"` when no signing key is configured. */
export type SyncfySignatureVerification = "valid" | "invalid" | "skipped";

/** Diagnostic breakdown of a Syncfy webhook signature check, logged (never thrown) to aid debugging signature mismatches without exposing the secret. */
export type SyncfyWebhookSignatureDiagnostics = {
  bodyBytes: number;
  hasSignature: boolean;
  signatureLength: number;
  signaturePreview: {
    first6: string | null;
    last6: string | null;
  };
  signatureShape: {
    hasSha256Prefix: boolean;
    hasKeyValue: boolean;
    hasComma: boolean;
    hasSemicolon: boolean;
    hasQuotes: boolean;
    dotSegmentCount: number;
  };
  keyShape: "missing" | "plain" | "json_string" | "json_k" | "json_nested_k" | "json_other";
  verificationCandidatesTried: {
    keyMaterial: string[];
    signatureParsers: string[];
    digestFormats: string[];
    parsedSignatureCandidateCount: number;
  };
};

/** Shape of one Syncfy webhook event payload as delivered to the webhook route. */
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

/** Syncfy transaction payload normalized into the fields FlowLedger's import pipeline needs. */
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

/** Syncfy account payload normalized into the fields FlowLedger's import pipeline needs. */
export type NormalizedSyncfyAccount = {
  syncfyAccountId: string;
  syncfyCredentialId?: string;
  name: string;
  type?: string;
  currency?: string;
  balance?: number;
  rawData: JsonRecord;
};

/** Syncfy institution (site) payload normalized into the fields FlowLedger's institution list needs. */
export type NormalizedSyncfyInstitution = {
  syncfyInstitutionId: string;
  name: string;
  logoUrl?: string;
  country?: string;
  category: string;
  supportedAccountTypes: string[];
  rawData: JsonRecord;
};

/** Syncfy user record shape, whether returned from a lookup or a creation call. */
export type SyncfyUser = {
  idUser: string;
  externalUserId?: string;
  name?: string;
  rawData: JsonRecord;
};

/** Summary of a webhook-triggered credential refresh/import, returned to callers and used for logging. */
export type SyncfyProcessingSummary = {
  status: "processed" | "ignored";
  importedAccounts: number;
  importedTransactions: number;
  insertedOrUpdatedImportedTransactions?: number;
  skippedDuplicateTransactions?: number;
  refreshAttemptCount?: number;
  balanceFingerprint?: string;
};

/** Summary of a manual or scheduled resync, including whether the connection now requires manual reconnect. */
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

/** Metadata persisted on a `ProviderConnection.rawData` about a credential's endpoints, so later resyncs don't need the original webhook payload. */
export type StoredSyncfyRefreshMetadata = {
  provider: "syncfy";
  providerCredentialId: string;
  providerUserId: string;
  endpoints: unknown;
  storedAt: string;
  updatedAt: string;
  endpointSummary: ReturnType<typeof summarizeSyncfyEndpoints>;
};
