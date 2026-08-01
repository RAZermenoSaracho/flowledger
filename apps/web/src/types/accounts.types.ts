import type {
  AccountType,
  ProviderConnector,
  ProviderInstitution
} from "@flowledger/shared";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  identifier?: string | null;
  currency: string;
  initialBalance: number;
  currentBalance?: number;
  currentBalanceInPreferredCurrency?: number;
  source?: "manual" | "synced";
  sync?: AccountSync[];
  isArchived: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

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

export type Institution = ProviderInstitution;
export type Connector = ProviderConnector;

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
