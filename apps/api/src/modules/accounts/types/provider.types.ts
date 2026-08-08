import type { SyncfySignatureVerification } from "../providers/syncfy/types/syncfy.types.js";

/** Identifier for a supported financial provider; widened to `string & {}` so unregistered/future provider keys still type-check before being validated at runtime by the registry. */
export type ProviderKey = "syncfy" | (string & {});

/** Category tag used to group and filter institutions/connectors in the catalog UI. */
export type InstitutionCategory =
  | "bank"
  | "broker"
  | "exchange"
  | "wallet"
  | "government"
  | "other";

/** Institution record normalized to a common shape across providers; `rawData` retains the original provider payload. */
export type ProviderInstitution = {
  provider: ProviderKey;
  institutionId: string;
  name: string;
  logoUrl: string | null;
  country: string | null;
  category: InstitutionCategory;
  supportedAccountTypes: string[];
  rawData: Record<string, unknown>;
};

/** Connector record for providers that expose a generic connection flow rather than a per-institution catalog. */
export type ProviderConnector = {
  provider: ProviderKey;
  connectorId: string;
  title: string;
  description: string;
  helperText?: string;
  country: string | null;
  category: InstitutionCategory;
  coverageLabel: string;
  metadata?: Record<string, unknown>;
};

/** Input for creating a provider-side user record that maps back to a FlowLedger user via `externalUserId`. */
export type CreateProviderUserInput = {
  externalUserId: string;
  metadata?: Record<string, unknown>;
};

/** Provider-side user record normalized to a common shape across providers. */
export type ProviderUser = {
  provider: ProviderKey;
  providerUserId: string;
  externalUserId?: string;
  rawData?: Record<string, unknown>;
};

/** Input for creating a provider session token, e.g. for a connect widget. */
export type CreateProviderSessionInput = {
  providerUserId: string;
  externalUserId?: string;
};

/** Provider session record normalized to a common shape across providers. */
export type ProviderSession = {
  provider: ProviderKey;
  token: string;
  expiresAt?: Date;
  rawData?: Record<string, unknown>;
};

/** Input for starting a provider connection flow (institution linking, widget/OAuth handoff). */
export type CreateProviderConnectionFlowInput = {
  providerUserId: string;
  externalUserId?: string;
  institutionId?: string;
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
};

/** Connection-flow record normalized to a common shape across providers; `widget` is present only for providers that hand off to an embedded connect widget. */
export type ProviderConnectionFlow = {
  provider: ProviderKey;
  flowId?: string;
  token?: string;
  url?: string;
  widget?: {
    token: string;
    config: Record<string, unknown>;
    scriptUrl?: string;
    styleUrl?: string;
  };
  rawData?: Record<string, unknown>;
};

/** Wrapper handed to a provider adapter's `handleWebhook`, generic over that provider's raw payload shape. */
export type ProviderWebhookInput<TPayload = unknown> = {
  eventId?: string;
  payload: TPayload;
  headers?: Record<string, unknown>;
};

/** Outcome returned by a provider adapter's `handleWebhook` after processing one event. */
export type ProviderWebhookResult = {
  status: "processed" | "ignored" | "failed";
  importedAccounts?: number;
  importedTransactions?: number;
};

/** Input for fetching a provider's accounts; which fields are required depends on the provider's auth model. */
export type FetchProviderAccountsInput = {
  providerUserId?: string;
  providerCredentialId?: string;
  sessionToken?: string;
  endpoint?: string;
};

/** Account record normalized to a common shape across providers; `rawData` retains the original provider payload for later re-normalization. */
export type ProviderAccount = {
  provider: ProviderKey;
  providerAccountId: string;
  providerCredentialId?: string;
  name: string;
  type?: string;
  currency?: string;
  balance?: number;
  rawData: Record<string, unknown>;
};

/** Input for fetching a provider's transactions, optionally scoped to one account and/or a date range. */
export type FetchProviderTransactionsInput = {
  providerUserId?: string;
  providerCredentialId?: string;
  providerAccountId?: string;
  sessionToken?: string;
  endpoint?: string;
  from?: Date;
  to?: Date;
};

/** Transaction record normalized to a common shape across providers; `rawData` retains the original provider payload. */
export type ProviderTransaction = {
  provider: ProviderKey;
  providerTransactionId: string;
  providerCredentialId: string;
  providerAccountId: string;
  description: string;
  amount: number;
  currency: string;
  transactionDate: Date;
  refreshDate?: Date;
  rawData: Record<string, unknown>;
};

/** Input for turning one raw provider account payload into a `ProviderAccount`; `fallbackCredentialId` fills in when the raw payload doesn't carry its own credential id. */
export type NormalizeProviderAccountInput = {
  account: unknown;
  fallbackCredentialId?: string;
};

/** Input for turning one raw provider transaction payload into a `ProviderTransaction`; `fallbackCredentialId` fills in when the raw payload doesn't carry its own credential id. */
export type NormalizeProviderTransactionInput = {
  transaction: unknown;
  fallbackCredentialId?: string;
};

/** Adapter capability: expose an institution catalog. */
export interface ProviderInstitutionsAdapter {
  listInstitutions(): Promise<ProviderInstitution[]>;
}

/** Adapter capability: expose a generic (non-institution-specific) connector list. */
export interface ProviderConnectorsAdapter {
  listConnectors(): Promise<ProviderConnector[]>;
}

/** Adapter capability: create a provider-side user. */
export interface ProviderUserAdapter {
  createUser(input: CreateProviderUserInput): Promise<ProviderUser>;
}

/** Adapter capability: create a provider session token. */
export interface ProviderSessionAdapter {
  createSession(input: CreateProviderSessionInput): Promise<ProviderSession>;
}

/** Adapter capability: start a connection flow for linking an institution. */
export interface ProviderConnectionFlowAdapter {
  createConnectionFlow(
    input: CreateProviderConnectionFlowInput
  ): Promise<ProviderConnectionFlow>;
}

/** Adapter capability: process an inbound webhook event. */
export interface ProviderWebhookAdapter<TPayload = unknown> {
  handleWebhook(
    input: ProviderWebhookInput<TPayload>
  ): Promise<ProviderWebhookResult>;
}

/** Adapter capability: fetch and normalize a provider's accounts. */
export interface ProviderAccountsAdapter {
  fetchAccounts(input: FetchProviderAccountsInput): Promise<ProviderAccount[]>;
  normalizeAccount(input: NormalizeProviderAccountInput): ProviderAccount;
}

/** Adapter capability: fetch and normalize a provider's transactions. */
export interface ProviderTransactionsAdapter {
  fetchTransactions(
    input: FetchProviderTransactionsInput
  ): Promise<ProviderTransaction[]>;
  normalizeTransaction(
    input: NormalizeProviderTransactionInput
  ): ProviderTransaction;
}

/** Outcome of `handleProviderWebhook` — `"generic"` for non-Syncfy providers (no signature verification), the rest specific to the Syncfy signature-then-parse pipeline. */
export type ProviderWebhookHandlingResult =
  | { kind: "generic"; result: unknown }
  | { kind: "invalid_signature" }
  | { kind: "invalid_payload" }
  | {
      kind: "processed";
      rid?: string;
      signatureVerification: SyncfySignatureVerification;
      acceptedEvents: number;
    };

/** Union of all optional adapter capabilities a provider may implement; a provider only implements the capabilities its integration actually supports. */
export type FinancialProviderAdapter<TWebhookPayload = unknown> = {
  key: ProviderKey;
  displayName: string;
} & Partial<ProviderInstitutionsAdapter> &
  Partial<ProviderConnectorsAdapter> &
  Partial<ProviderUserAdapter> &
  Partial<ProviderSessionAdapter> &
  Partial<ProviderConnectionFlowAdapter> &
  Partial<ProviderWebhookAdapter<TWebhookPayload>> &
  Partial<ProviderAccountsAdapter> &
  Partial<ProviderTransactionsAdapter>;
