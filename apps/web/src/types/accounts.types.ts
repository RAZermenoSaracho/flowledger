import type {
  AccountHoldings,
  AccountType,
  HoldingKind,
  HoldingsValuation,
  PaymentDueRule,
  ProviderConnector,
  ProviderInstitution
} from "@flowledger/shared";

/** Account record shape as returned by the API. */
export type Account = {
  id: string;
  name: string;
  type: AccountType;
  identifier?: string | null;
  currency: string;
  initialBalance: string;
  creditLimit?: string | null;
  statementClosingDay?: number | null;
  paymentDueRule?: PaymentDueRule | null;
  paymentDueValue?: number | null;
  billingTimeZone?: string | null;
  annualInterestRate?: string | null;
  currentBalance?: string;
  currentBalanceInPreferredCurrency?: number;
  /** Aggregate holdings value (account currency, exact string); `null` or absent for account types without holdings; `empty` status when it has none. */
  holdingsValuation?: HoldingsValuation | null;
  source?: "manual" | "synced";
  sync?: AccountSync[];
  isArchived: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Provider sync status and metadata for an account linked to a bank connection. */
export type AccountSync = {
  id: string;
  provider: string;
  providerCredentialId: string;
  providerAccountId: string;
  institutionId?: string | null;
  institutionName?: string | null;
  accountName?: string | null;
  accountType?: string | null;
  currency?: string | null;
  externalBalance?: number | null;
  status: string;
  failureReason?: string | null;
  requiresManualReconnect?: boolean;
  connectionStatus?: string | null;
  lastSyncAt?: string | null;
  lastSyncSuccessAt?: string | null;
  lastSyncFailureAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Alias of `ProviderInstitution`. */
export type Institution = ProviderInstitution;
/** Alias of `ProviderConnector`. */
export type Connector = ProviderConnector;

/** Outcome of a provider resync/refresh: counts imported plus any reconnect requirement. */
export type ProviderResyncResult = {
  status: string;
  importedAccounts: number;
  importedTransactions: number;
  requiresManualReconnect?: boolean;
  failureReason?: string;
};

/** Provider account fetched from a connection but not yet linked to a FlowLedger account. */
export type ProviderImportedAccount = {
  id: string;
  provider: string;
  institutionName?: string | null;
  name: string;
  type: AccountType;
  providerType?: string | null;
  currency?: string | null;
  balance?: number | null;
  status: string;
  failureReason?: string | null;
  requiresManualReconnect?: boolean;
  lastSyncAt?: string | null;
  lastSyncSuccessAt?: string | null;
  lastSyncFailureAt?: string | null;
  connectionStatus?: string | null;
  connectionFailureReason?: string | null;
  connectionRequiresManualReconnect?: boolean;
  linkedAccountId?: string | null;
  linkedAccount?: Pick<Account, "id" | "name" | "type"> | null;
  createdAt: string;
  updatedAt: string;
};

export type { AccountHoldings };

/** One item of a holdings change set as sent on the wire (decimal strings, ISO date); without `id` it creates a holding. */
export type HoldingUpsert = {
  id?: string;
  kind?: HoldingKind;
  code?: string;
  name?: string;
  unit?: string;
  quantity?: string;
  manualUnitPrice?: string | null;
  manualPriceCurrency?: string;
  manualPricedAt?: string;
};

/** Body of `PATCH /accounts/:id/holdings`. */
export type HoldingsChangeSet = { upsert: HoldingUpsert[]; remove: string[] };
