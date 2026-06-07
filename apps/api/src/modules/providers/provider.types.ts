export type ProviderKey = "syncfy" | (string & {});

export type InstitutionCategory =
  | "bank"
  | "broker"
  | "exchange"
  | "wallet"
  | "government"
  | "other";

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

export type CreateProviderUserInput = {
  externalUserId: string;
  metadata?: Record<string, unknown>;
};

export type ProviderUser = {
  provider: ProviderKey;
  providerUserId: string;
  externalUserId?: string;
  rawData?: Record<string, unknown>;
};

export type CreateProviderSessionInput = {
  providerUserId: string;
  externalUserId?: string;
};

export type ProviderSession = {
  provider: ProviderKey;
  token: string;
  expiresAt?: Date;
  rawData?: Record<string, unknown>;
};

export type CreateProviderConnectionFlowInput = {
  providerUserId: string;
  externalUserId?: string;
  institutionId?: string;
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
};

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

export type ProviderWebhookInput<TPayload = unknown> = {
  eventId?: string;
  payload: TPayload;
  headers?: Record<string, unknown>;
};

export type ProviderWebhookResult = {
  status: "processed" | "ignored" | "failed";
  importedAccounts?: number;
  importedTransactions?: number;
};

export type FetchProviderAccountsInput = {
  providerUserId?: string;
  providerCredentialId?: string;
  sessionToken?: string;
  endpoint?: string;
};

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

export type FetchProviderTransactionsInput = {
  providerUserId?: string;
  providerCredentialId?: string;
  providerAccountId?: string;
  sessionToken?: string;
  endpoint?: string;
  from?: Date;
  to?: Date;
};

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

export type NormalizeProviderAccountInput = {
  account: unknown;
  fallbackCredentialId?: string;
};

export type NormalizeProviderTransactionInput = {
  transaction: unknown;
  fallbackCredentialId?: string;
};

export interface ProviderInstitutionsAdapter {
  listInstitutions(): Promise<ProviderInstitution[]>;
}

export interface ProviderUserAdapter {
  createUser(input: CreateProviderUserInput): Promise<ProviderUser>;
}

export interface ProviderSessionAdapter {
  createSession(input: CreateProviderSessionInput): Promise<ProviderSession>;
}

export interface ProviderConnectionFlowAdapter {
  createConnectionFlow(
    input: CreateProviderConnectionFlowInput
  ): Promise<ProviderConnectionFlow>;
}

export interface ProviderWebhookAdapter<TPayload = unknown> {
  handleWebhook(
    input: ProviderWebhookInput<TPayload>
  ): Promise<ProviderWebhookResult>;
}

export interface ProviderAccountsAdapter {
  fetchAccounts(input: FetchProviderAccountsInput): Promise<ProviderAccount[]>;
  normalizeAccount(input: NormalizeProviderAccountInput): ProviderAccount;
}

export interface ProviderTransactionsAdapter {
  fetchTransactions(
    input: FetchProviderTransactionsInput
  ): Promise<ProviderTransaction[]>;
  normalizeTransaction(
    input: NormalizeProviderTransactionInput
  ): ProviderTransaction;
}

export type FinancialProviderAdapter<TWebhookPayload = unknown> = {
  key: ProviderKey;
  displayName: string;
} & Partial<ProviderInstitutionsAdapter> &
  Partial<ProviderUserAdapter> &
  Partial<ProviderSessionAdapter> &
  Partial<ProviderConnectionFlowAdapter> &
  Partial<ProviderWebhookAdapter<TWebhookPayload>> &
  Partial<ProviderAccountsAdapter> &
  Partial<ProviderTransactionsAdapter>;
