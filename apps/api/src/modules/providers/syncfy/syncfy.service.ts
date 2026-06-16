import { Prisma } from "@prisma/client";
import { env } from "../../../config/env.js";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";

const syncfyApiBaseUrl = env.SYNCFY_API_BASE_URL;
const syncfyDataBaseUrl = env.SYNCFY_DATA_BASE_URL;
const syncfyTransactionLookbackDays = env.SYNCFY_TRANSACTION_LOOKBACK_DAYS;
const syncfyTransactionPageLimit = 500;
const manualSyncfyRefreshRetryDelaysMs = [0, 5_000, 15_000, 30_000] as const;

type JsonRecord = Record<string, unknown>;

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

type StoredSyncfyRefreshMetadata = {
  provider: "syncfy";
  providerCredentialId: string;
  providerUserId: string;
  endpoints: unknown;
  storedAt: string;
  updatedAt: string;
  endpointSummary: ReturnType<typeof summarizeSyncfyEndpoints>;
};

function getJsonObject(value: unknown): JsonRecord | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function requiredString(record: JsonRecord, keys: string[], fieldName: string) {
  for (const key of keys) {
    const value = getString(record[key]);
    if (value) return value;
  }

  throw new HttpError(502, `Syncfy payload is missing ${fieldName}`);
}

function requiredNumber(record: JsonRecord, keys: string[], fieldName: string) {
  for (const key of keys) {
    const value = getNumber(record[key]);
    if (value !== undefined) return value;
  }

  throw new HttpError(502, `Syncfy payload is missing ${fieldName}`);
}

function uniqueStrings(values: (string | undefined)[]) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value)))
  );
}

function unixTimestampToDate(value: unknown, fieldName: string) {
  const timestamp = getNumber(value);

  if (timestamp === undefined) {
    throw new HttpError(502, `Syncfy payload is missing ${fieldName}`);
  }

  const milliseconds =
    timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;

  const date = new Date(milliseconds);

  if (Number.isNaN(date.getTime())) {
    throw new HttpError(502, `Syncfy payload has invalid ${fieldName}`);
  }

  return date;
}

function extractSyncfyToken(responseBody: unknown) {
  const body = getJsonObject(responseBody);
  const response = getJsonObject(body?.response);
  return getString(body?.token ?? response?.token);
}

function extractSyncfyList(responseBody: unknown, key: string): unknown[] {
  if (Array.isArray(responseBody)) return responseBody;

  const body = getJsonObject(responseBody);
  const response = body?.response;

  if (Array.isArray(response)) return response;

  const responseObject = getJsonObject(response);

  if (Array.isArray(responseObject?.[key])) return responseObject[key];
  if (Array.isArray(body?.[key])) return body[key];

  return [];
}

function extractSyncfyUser(responseBody: unknown): unknown {
  const body = getJsonObject(responseBody);
  const response = getJsonObject(body?.response);

  return response ?? body ?? responseBody;
}

export function getSyncfyEndpointList(
  endpoints: unknown,
  key: "accounts" | "transactions"
) {
  const endpointMap = getJsonObject(endpoints);
  if (!endpointMap) return [];

  const value = endpointMap[key];

  if (Array.isArray(value)) {
    return value.filter((endpoint): endpoint is string =>
      Boolean(getString(endpoint))
    );
  }

  const endpoint = getString(value);
  return endpoint ? [endpoint] : [];
}

export function summarizeSyncfyEndpoints(endpoints: unknown) {
  const accountEndpointCount = getSyncfyEndpointList(
    endpoints,
    "accounts"
  ).length;
  const transactionEndpointCount = getSyncfyEndpointList(
    endpoints,
    "transactions"
  ).length;

  return {
    accountEndpointCount,
    transactionEndpointCount,
    endpointTypes: [
      accountEndpointCount > 0 ? "accounts" : null,
      transactionEndpointCount > 0 ? "transactions" : null
    ].filter((value): value is string => Boolean(value))
  };
}

function buildSyncfyApiUrl(pathname: string) {
  if (!env.SYNCFY_API_KEY) {
    throw new HttpError(500, "Syncfy API key is not configured");
  }

  const url = new URL(pathname, syncfyApiBaseUrl);
  url.searchParams.set("api_key", env.SYNCFY_API_KEY);

  return url;
}

function buildSyncfyDataUrl(endpoint: string, token: string) {
  const url = new URL(endpoint, syncfyDataBaseUrl);

  if (url.origin !== syncfyDataBaseUrl) {
    throw new HttpError(400, "Unexpected Syncfy endpoint host");
  }

  url.searchParams.set("token", token);

  return url;
}

function sanitizeSyncfyDataEndpoint(endpoint: string) {
  const url = new URL(endpoint, syncfyDataBaseUrl);

  if (url.origin !== syncfyDataBaseUrl) {
    throw new HttpError(400, "Unexpected Syncfy endpoint host");
  }

  const sensitiveParams = [
    "token",
    "api_key",
    "username",
    "password",
    "pass",
    "otp",
    "twofa",
    "security_answer",
    "card_number",
    "cvv",
    "pin"
  ];

  for (const param of sensitiveParams) {
    url.searchParams.delete(param);
  }

  return `${url.pathname}${url.search}`;
}

function sanitizeSyncfyEndpointList(
  endpoints: unknown,
  key: "accounts" | "transactions"
) {
  return getSyncfyEndpointList(endpoints, key)
    .map((endpoint) => sanitizeSyncfyDataEndpoint(endpoint))
    .filter((endpoint) => {
      const pathname = new URL(endpoint, syncfyDataBaseUrl).pathname;
      return key === "accounts"
        ? pathname === "/v1/accounts"
        : pathname === "/v1/transactions";
    });
}

export function buildSyncfyRefreshMetadata(input: {
  providerCredentialId: string;
  providerUserId: string;
  endpoints: unknown;
  now?: Date;
}): StoredSyncfyRefreshMetadata {
  const endpoints = {
    accounts: sanitizeSyncfyEndpointList(input.endpoints, "accounts"),
    transactions: sanitizeSyncfyEndpointList(input.endpoints, "transactions")
  };
  const now = (input.now ?? new Date()).toISOString();

  return {
    provider: "syncfy",
    providerCredentialId: input.providerCredentialId,
    providerUserId: input.providerUserId,
    endpoints,
    storedAt: now,
    updatedAt: now,
    endpointSummary: summarizeSyncfyEndpoints(endpoints)
  };
}

export function getSyncfyRefreshMetadata(rawData: unknown) {
  const raw = getJsonObject(rawData);
  const metadata = getJsonObject(raw?.syncfyRefreshMetadata);

  if (!metadata) return undefined;

  return {
    providerUserId: getString(metadata.providerUserId),
    endpoints: metadata.endpoints
  };
}

export function buildSyncfyTransactionDataUrl(input: {
  endpoint: string;
  token: string;
  skip?: number;
  limit?: number;
  now?: Date;
}) {
  const limit = input.limit ?? syncfyTransactionPageLimit;
  const skip = input.skip ?? 0;
  const now = input.now ?? new Date();
  const toSeconds = Math.floor(now.getTime() / 1000);
  const fromSeconds =
    toSeconds - syncfyTransactionLookbackDays * 24 * 60 * 60;
  const url = buildSyncfyDataUrl(input.endpoint, input.token);

  if (url.pathname !== "/v1/transactions") {
    throw new HttpError(400, "Unexpected Syncfy transaction endpoint path");
  }

  url.searchParams.delete("dt_refresh_from");
  url.searchParams.delete("dt_refresh_to");
  url.searchParams.delete("limit");
  url.searchParams.delete("skip");
  url.searchParams.set("dt_refresh_from", String(fromSeconds));
  url.searchParams.set("dt_refresh_to", String(toSeconds));
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("skip", String(skip));

  return url;
}

async function fetchJson(url: URL, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
    console.error("[SYNCFY REQUEST FAILED]", {
      pathname: url.pathname,
      status: response.status
    });

    throw new HttpError(
      502,
      `Syncfy request failed with status ${response.status}`
    );
  }

  return body;
}

export async function createSyncfySession(idUser: string) {
  const url = buildSyncfyApiUrl("/v1/sessions");

  const body = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_user: idUser })
  });

  const token = extractSyncfyToken(body);

  if (!token) {
    throw new HttpError(502, "Syncfy session response did not include a token");
  }

  return { token };
}

function normalizeSyncfyUser(user: unknown): SyncfyUser {
  const rawData = getJsonObject(user);

  if (!rawData) {
    throw new HttpError(502, "Syncfy user payload is not an object");
  }

  return {
    idUser: requiredString(rawData, ["id_user", "id"], "id_user"),
    externalUserId: getString(rawData.id_external),
    name: getString(rawData.name),
    rawData
  };
}

export async function fetchSyncfyUserByExternalId(externalUserId: string) {
  const url = buildSyncfyApiUrl("/v1/users");
  url.searchParams.set("id_external", externalUserId);

  const body = await fetchJson(url);
  const [user] = extractSyncfyList(body, "users").map(normalizeSyncfyUser);

  return user;
}

export async function createSyncfyUser(input: {
  externalUserId: string;
  name: string;
}) {
  const url = buildSyncfyApiUrl("/v1/users");

  const body = await fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id_external: input.externalUserId,
      name: input.name
    })
  });

  return normalizeSyncfyUser(extractSyncfyUser(body));
}

async function saveSyncfyUserMapping(input: {
  flowLedgerUserId: string;
  email: string;
  syncfyUser: SyncfyUser;
}) {
  await prisma.userAuthAccount.upsert({
    where: {
      provider_providerAccountId: {
        provider: "syncfy",
        providerAccountId: input.syncfyUser.idUser
      }
    },
    create: {
      userId: input.flowLedgerUserId,
      provider: "syncfy",
      providerAccountId: input.syncfyUser.idUser,
      email: input.email
    },
    update: {
      userId: input.flowLedgerUserId,
      email: input.email
    }
  });
}

export async function getOrCreateSyncfyUserForFlowLedgerUser(
  flowLedgerUserId: string
) {
  const flowLedgerUser = await prisma.user.findUnique({
    where: { id: flowLedgerUserId },
    select: { id: true, email: true, name: true }
  });

  if (!flowLedgerUser) {
    throw new HttpError(404, "FlowLedger user was not found");
  }

  const existingMapping = await prisma.userAuthAccount.findFirst({
    where: {
      userId: flowLedgerUser.id,
      provider: "syncfy"
    },
    orderBy: { createdAt: "desc" }
  });

  if (existingMapping) {
    return {
      idUser: existingMapping.providerAccountId,
      externalUserId: flowLedgerUser.id,
      name: flowLedgerUser.name,
      rawData: {}
    } satisfies SyncfyUser;
  }

  const existingSyncfyUser = await fetchSyncfyUserByExternalId(
    flowLedgerUser.id
  );

  const syncfyUser =
    existingSyncfyUser ??
    (await createSyncfyUser({
      externalUserId: flowLedgerUser.id,
      name: flowLedgerUser.name
    }));

  await saveSyncfyUserMapping({
    flowLedgerUserId: flowLedgerUser.id,
    email: flowLedgerUser.email,
    syncfyUser
  });

  return syncfyUser;
}

export function normalizeSyncfyAccount(
  account: unknown,
  fallbackCredentialId?: string
): NormalizedSyncfyAccount {
  const rawData = getJsonObject(account);

  if (!rawData) {
    throw new HttpError(502, "Syncfy account payload is not an object");
  }

  return {
    syncfyAccountId: requiredString(
      rawData,
      ["id_account", "id"],
      "id_account"
    ),
    syncfyCredentialId:
      getString(rawData.id_credential) ?? fallbackCredentialId,
    name:
      getString(rawData.name) ??
      getString(rawData.description) ??
      getString(rawData.number) ??
      "Syncfy account",
    type: getString(rawData.type) ?? getString(rawData.account_type),
    currency: getString(rawData.currency),
    balance: getNumber(rawData.balance),
    rawData
  };
}

export function normalizeSyncfyInstitution(
  institution: unknown
): NormalizedSyncfyInstitution {
  const record = getJsonObject(institution);
  if (!record)
    throw new HttpError(502, "Syncfy institution payload is invalid");

  const country = getJsonObject(record.country);
  const products = Array.isArray(record.products) ? record.products : [];
  const category = getString(record.type) ?? "bank";

  return {
    syncfyInstitutionId: requiredString(record, ["id_site", "id"], "id_site"),
    name: requiredString(record, ["display_name", "name"], "display_name"),
    logoUrl: getString(record.logo_url),
    country: getString(country?.code),
    category,
    supportedAccountTypes: uniqueStrings([
      ...products.map((product) => getString(product)),
      category
    ]),
    rawData: record
  };
}

export function normalizeSyncfyTransaction(
  transaction: unknown,
  fallbackCredentialId?: string
): NormalizedSyncfyTransaction {
  const rawData = getJsonObject(transaction);

  if (!rawData) {
    throw new HttpError(502, "Syncfy transaction payload is not an object");
  }

  const syncfyCredentialId =
    getString(rawData.id_credential) ?? fallbackCredentialId;

  if (!syncfyCredentialId) {
    throw new HttpError(502, "Syncfy transaction is missing id_credential");
  }

  return {
    syncfyTransactionId: requiredString(
      rawData,
      ["id_transaction", "id"],
      "id_transaction"
    ),
    syncfyCredentialId,
    syncfyAccountId: requiredString(rawData, ["id_account"], "id_account"),
    description:
      getString(rawData.description) ??
      getString(rawData.name) ??
      getString(rawData.memo) ??
      "Syncfy transaction",
    amount: requiredNumber(rawData, ["amount"], "amount"),
    currency: getString(rawData.currency) ?? "MXN",
    transactionDate: unixTimestampToDate(
      rawData.dt_transaction,
      "dt_transaction"
    ),
    refreshDate: unixTimestampToDate(rawData.dt_refresh, "dt_refresh"),
    rawData
  };
}

export async function fetchSyncfyAccounts(
  endpoint: string,
  token: string,
  fallbackCredentialId?: string
) {
  const url = buildSyncfyDataUrl(endpoint, token);
  const body = await fetchJson(url);

  return extractSyncfyList(body, "accounts").map((account) =>
    normalizeSyncfyAccount(account, fallbackCredentialId)
  );
}

export async function fetchSyncfyTransactions(
  endpoint: string,
  token: string,
  fallbackCredentialId?: string,
  options: {
    fetchPage?: (url: URL) => Promise<unknown>;
    now?: Date;
    limit?: number;
  } = {}
) {
  const limit = options.limit ?? syncfyTransactionPageLimit;
  const fetchPage = options.fetchPage ?? fetchJson;
  const transactions: unknown[] = [];
  let pageCount = 0;

  for (let skip = 0; ; skip += limit) {
    const url = buildSyncfyTransactionDataUrl({
      endpoint,
      token,
      skip,
      limit,
      now: options.now
    });
    const body = await fetchPage(url);
    const page = extractSyncfyList(body, "transactions");

    pageCount += 1;
    transactions.push(...page);

    if (page.length < limit) {
      break;
    }
  }

  console.info("[SYNCFY TRANSACTIONS] Fetched transaction pages", {
    pageCount,
    fetchedTransactionsCount: transactions.length,
    limit
  });

  return transactions.map((transaction) =>
    normalizeSyncfyTransaction(transaction, fallbackCredentialId)
  );
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function getEndpointSummary(endpoints: unknown) {
  const summary = summarizeSyncfyEndpoints(endpoints);

  return {
    hasEndpoints:
      summary.accountEndpointCount > 0 || summary.transactionEndpointCount > 0,
    endpointTypes: summary.endpointTypes
  };
}

function providerAccountKey(
  providerCredentialId: string,
  providerAccountId: string
) {
  return `${providerCredentialId}:${providerAccountId}`;
}

export function buildSyncfyProviderAccountMetadata(
  account: Pick<NormalizedSyncfyAccount, "name" | "type" | "currency" | "balance">
) {
  return {
    name: account.name,
    type: account.type,
    currency: account.currency,
    balance: account.balance
  };
}

function syncfyBalanceFingerprint(accounts: NormalizedSyncfyAccount[]) {
  return JSON.stringify(
    accounts
      .map((account) => ({
        id: account.syncfyAccountId,
        credentialId: account.syncfyCredentialId ?? null,
        balance: account.balance ?? null,
        currency: account.currency ?? null
      }))
      .sort((left, right) =>
        `${left.credentialId ?? ""}:${left.id}`.localeCompare(
          `${right.credentialId ?? ""}:${right.id}`
        )
      )
  );
}

export function shouldStopSyncfyRefreshRetry(input: {
  attemptIndex: number;
  totalAttempts: number;
  previousFetchedTransactionsCount?: number;
  previousBalanceFingerprint?: string;
  fetchedTransactionsCount: number;
  balanceFingerprint: string;
  insertedOrUpdatedImportedTransactions: number;
}) {
  if (input.insertedOrUpdatedImportedTransactions > 0) return true;
  if (input.attemptIndex >= input.totalAttempts - 1) return true;
  if (
    input.previousFetchedTransactionsCount !== undefined &&
    input.previousFetchedTransactionsCount !== input.fetchedTransactionsCount
  ) {
    return true;
  }
  if (
    input.previousBalanceFingerprint !== undefined &&
    input.previousBalanceFingerprint !== input.balanceFingerprint
  ) {
    return true;
  }

  return false;
}

export function resolveSyncfyImportedTransactionStatus(input: {
  existingStatus?: string | null;
  transactionId?: string | null;
}) {
  if (!input.existingStatus) return "pending";

  return nextSyncfyImportedTransactionStatus({
    status: input.existingStatus,
    transactionId: input.transactionId
  });
}

export function summarizeSyncfyImportedTransactionWrites(input: {
  existingTransactionIds: Set<string>;
  transactions: Pick<NormalizedSyncfyTransaction, "syncfyTransactionId">[];
}) {
  const skippedDuplicateTransactions = input.transactions.filter((transaction) =>
    input.existingTransactionIds.has(transaction.syncfyTransactionId)
  ).length;

  return {
    insertedOrUpdatedImportedTransactions:
      input.transactions.length - skippedDuplicateTransactions,
    skippedDuplicateTransactions
  };
}

export function buildPendingSyncfyImportedTransactionCandidates(input: {
  existingTransactionIds: Set<string>;
  transactions: NormalizedSyncfyTransaction[];
}) {
  return input.transactions
    .filter(
      (transaction) =>
        !input.existingTransactionIds.has(transaction.syncfyTransactionId)
    )
    .map((transaction) => ({
      providerTransactionId: transaction.syncfyTransactionId,
      providerCredentialId: transaction.syncfyCredentialId,
      providerAccountId: transaction.syncfyAccountId,
      description: transaction.description,
      amount: transaction.amount,
      currency: transaction.currency,
      transactionDate: transaction.transactionDate,
      refreshDate: transaction.refreshDate,
      status: resolveSyncfyImportedTransactionStatus({}),
      rawData: transaction.rawData
    }));
}

async function findFlowLedgerUserIdForSyncfyUser(syncfyUserId: string) {
  const mapping = await prisma.userAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider: "syncfy",
        providerAccountId: syncfyUserId
      }
    },
    select: { userId: true }
  });

  return mapping?.userId;
}

async function findFlowLedgerUserIdForSyncfyCredential(
  syncfyCredentialId: string
) {
  const connection = await prisma.providerConnection.findUnique({
    where: {
      provider_providerCredentialId: {
        provider: "syncfy",
        providerCredentialId: syncfyCredentialId
      }
    },
    select: { userId: true }
  });

  return connection?.userId;
}

async function upsertProviderConnection(input: {
  userId: string;
  providerUserId: string;
  providerCredentialId: string;
  endpoints: unknown;
}) {
  const now = new Date();
  const refreshMetadata = buildSyncfyRefreshMetadata({
    providerCredentialId: input.providerCredentialId,
    providerUserId: input.providerUserId,
    endpoints: input.endpoints,
    now
  });
  const endpointSummary = getEndpointSummary(refreshMetadata.endpoints);

  return prisma.providerConnection.upsert({
    where: {
      provider_providerCredentialId: {
        provider: "syncfy",
        providerCredentialId: input.providerCredentialId
      }
    },
    create: {
      userId: input.userId,
      provider: "syncfy",
      providerUserId: input.providerUserId,
      providerCredentialId: input.providerCredentialId,
      status: "active",
      failureReason: null,
      requiresManualReconnect: false,
      lastSyncAt: now,
      lastSyncSuccessAt: now,
      lastSyncFailureAt: null,
      rawData: toJsonValue({
        id_credential: input.providerCredentialId,
        syncfyRefreshMetadata: refreshMetadata,
        ...endpointSummary
      })
    },
    update: {
      userId: input.userId,
      providerUserId: input.providerUserId,
      status: "active",
      failureReason: null,
      requiresManualReconnect: false,
      lastSyncAt: now,
      lastSyncSuccessAt: now,
      lastSyncFailureAt: null,
      rawData: toJsonValue({
        id_credential: input.providerCredentialId,
        syncfyRefreshMetadata: refreshMetadata,
        ...endpointSummary
      })
    }
  });
}

async function upsertProviderAccounts(input: {
  userId: string;
  connectionId: string;
  providerUserId: string;
  accounts: NormalizedSyncfyAccount[];
}) {
  const refs = new Map<string, string>();
  const now = new Date();

  for (const account of input.accounts) {
    if (!account.syncfyCredentialId) {
      throw new HttpError(502, "Syncfy account is missing id_credential");
    }

    const providerAccount = await prisma.providerAccount.upsert({
      where: {
        provider_providerCredentialId_providerAccountId: {
          provider: "syncfy",
          providerCredentialId: account.syncfyCredentialId,
          providerAccountId: account.syncfyAccountId
        }
      },
      create: {
        userId: input.userId,
        connectionId: input.connectionId,
        provider: "syncfy",
        providerUserId: input.providerUserId,
        providerCredentialId: account.syncfyCredentialId,
        providerAccountId: account.syncfyAccountId,
        accountMetadata: toJsonValue(buildSyncfyProviderAccountMetadata(account)),
        status: "active",
        failureReason: null,
        requiresManualReconnect: false,
        lastSyncAt: now,
        lastSyncSuccessAt: now,
        lastSyncFailureAt: null,
        rawData: account.rawData as Prisma.InputJsonObject
      },
      update: {
        userId: input.userId,
        connectionId: input.connectionId,
        providerUserId: input.providerUserId,
        accountMetadata: toJsonValue(buildSyncfyProviderAccountMetadata(account)),
        status: "active",
        failureReason: null,
        requiresManualReconnect: false,
        lastSyncAt: now,
        lastSyncSuccessAt: now,
        lastSyncFailureAt: null,
        rawData: account.rawData as Prisma.InputJsonObject
      },
      select: {
        id: true,
        providerCredentialId: true,
        providerAccountId: true
      }
    });

    refs.set(
      providerAccountKey(
        providerAccount.providerCredentialId,
        providerAccount.providerAccountId
      ),
      providerAccount.id
    );
  }

  return refs;
}

async function findProviderAccountRefs(input: {
  providerCredentialId: string;
  providerAccountIds: string[];
}) {
  if (input.providerAccountIds.length === 0) return new Map<string, string>();

  const accounts = await prisma.providerAccount.findMany({
    where: {
      provider: "syncfy",
      providerCredentialId: input.providerCredentialId,
      providerAccountId: { in: Array.from(new Set(input.providerAccountIds)) }
    },
    select: {
      id: true,
      providerCredentialId: true,
      providerAccountId: true
    }
  });

  return new Map(
    accounts.map((account) => [
      providerAccountKey(
        account.providerCredentialId,
        account.providerAccountId
      ),
      account.id
    ])
  );
}

async function fetchAccountsFromEndpoints(input: {
  endpoints: string[];
  token: string;
  fallbackCredentialId?: string;
}) {
  const accounts: NormalizedSyncfyAccount[] = [];

  for (const endpoint of input.endpoints) {
    accounts.push(
      ...(await fetchSyncfyAccounts(
        endpoint,
        input.token,
        input.fallbackCredentialId
      ))
    );
  }

  return accounts;
}

async function fetchTransactionsFromEndpoints(input: {
  endpoints: string[];
  token: string;
  fallbackCredentialId?: string;
}) {
  const transactions: NormalizedSyncfyTransaction[] = [];

  for (const endpoint of input.endpoints) {
    transactions.push(
      ...(await fetchSyncfyTransactions(
        endpoint,
        input.token,
        input.fallbackCredentialId
      ))
    );
  }

  return transactions;
}

async function getExistingImportedTransactionIds(input: {
  provider: string;
  providerTransactionIds: string[];
}) {
  if (input.providerTransactionIds.length === 0) return new Set<string>();

  const rows = await prisma.providerImportedTransaction.findMany({
    where: {
      provider: input.provider,
      providerTransactionId: {
        in: Array.from(new Set(input.providerTransactionIds))
      }
    },
    select: {
      providerTransactionId: true
    }
  });

  return new Set(rows.map((row) => row.providerTransactionId));
}

async function notifyNewImportedTransactions(input: {
  userId: string;
  providerCredentialId: string;
  newTransactionsCount: number;
}) {
  if (input.newTransactionsCount <= 0) return;

  const pendingCount = await prisma.providerImportedTransaction.count({
    where: { userId: input.userId, status: "pending" }
  });
  const existing = await prisma.notification.findFirst({
    where: {
      userId: input.userId,
      type: "provider_transactions_pending",
      readAt: null
    }
  });
  const data = {
    title: "Imported transactions pending review",
    message: `You have ${pendingCount} imported transaction${
      pendingCount === 1 ? "" : "s"
    } pending review.`,
    metadata: toJsonValue({
      provider: "syncfy",
      providerCredentialId: input.providerCredentialId,
      pendingCount
    })
  };

  if (existing) {
    await prisma.notification.update({
      where: { id: existing.id },
      data
    });
    return;
  }

  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: "provider_transactions_pending",
      ...data
    }
  });
}

export function shouldMarkSyncfyManualReconnect(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /(mfa|otp|token|credential|unauthorized|forbidden|expired|interactive|login|session|401|403)/i.test(
    message
  );
}

export function countNewSyncfyImportedTransactionIds(input: {
  existingTransactionIds: Set<string>;
  transactions: Pick<NormalizedSyncfyTransaction, "syncfyTransactionId">[];
}) {
  return input.transactions.filter(
    (transaction) =>
      !input.existingTransactionIds.has(transaction.syncfyTransactionId)
  ).length;
}

export function nextSyncfyImportedTransactionStatus(input: {
  status: string;
  transactionId?: string | null;
}) {
  if (input.status === "imported") {
    return input.transactionId ? "processed" : "pending";
  }

  return input.status;
}

function safeFailureReason(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 1000);
}

async function markSyncfyCredentialManualReconnect(input: {
  userId?: string | null;
  connectionId?: string;
  providerCredentialId: string;
  failureReason: string;
}) {
  const now = new Date();

  await prisma.providerConnection.updateMany({
    where: {
      ...(input.connectionId ? { id: input.connectionId } : {}),
      provider: "syncfy",
      providerCredentialId: input.providerCredentialId,
      ...(input.userId ? { userId: input.userId } : {})
    },
    data: {
      status: "reconnect_required",
      failureReason: input.failureReason,
      requiresManualReconnect: true,
      lastSyncFailureAt: now
    }
  });

  await prisma.providerAccount.updateMany({
    where: {
      provider: "syncfy",
      providerCredentialId: input.providerCredentialId,
      ...(input.userId ? { userId: input.userId } : {})
    },
    data: {
      status: "reconnect_required",
      failureReason: input.failureReason,
      requiresManualReconnect: true,
      lastSyncFailureAt: now
    }
  });

}

async function processSyncfyCredentialRefresh(input: {
  eventId?: string;
  idUser: string;
  userId?: string;
  providerCredentialId?: string;
  endpoints: unknown;
}) {
  const accountEndpoints = getSyncfyEndpointList(input.endpoints, "accounts");
  const transactionEndpoints = getSyncfyEndpointList(
    input.endpoints,
    "transactions"
  );
  const endpointSummary = summarizeSyncfyEndpoints(input.endpoints);

  console.info("[SYNCFY IMPORT] Processing credential refresh", {
    eventId: input.eventId,
    providerCredentialId: input.providerCredentialId,
    endpointTypes: endpointSummary.endpointTypes,
    accountEndpointCount: endpointSummary.accountEndpointCount,
    transactionEndpointCount: endpointSummary.transactionEndpointCount
  });

  if (accountEndpoints.length === 0 && transactionEndpoints.length === 0) {
    if (input.eventId) {
      await prisma.providerWebhookEvent.update({
        where: { id: input.eventId },
        data: {
          status: "processed",
          processedAt: new Date()
        }
      });
    }

    return {
      status: "processed" as const,
      importedAccounts: 0,
      importedTransactions: 0,
      insertedOrUpdatedImportedTransactions: 0,
      skippedDuplicateTransactions: 0,
      refreshAttemptCount: 1,
      balanceFingerprint: syncfyBalanceFingerprint([])
    };
  }

  const { token } = await createSyncfySession(input.idUser);

  const accounts = await fetchAccountsFromEndpoints({
    endpoints: accountEndpoints,
    token,
    fallbackCredentialId: input.providerCredentialId
  });

  const transactions = await fetchTransactionsFromEndpoints({
    endpoints: transactionEndpoints,
    token,
    fallbackCredentialId: input.providerCredentialId
  });

  const existingTransactionIds = await getExistingImportedTransactionIds({
    provider: "syncfy",
    providerTransactionIds: transactions.map(
      (transaction) => transaction.syncfyTransactionId
    )
  });

  const newTransactionsCount = countNewSyncfyImportedTransactionIds({
    existingTransactionIds,
    transactions
  });
  const transactionWriteSummary = summarizeSyncfyImportedTransactionWrites({
    existingTransactionIds,
    transactions
  });
  const balanceFingerprint = syncfyBalanceFingerprint(accounts);

  const providerCredentialId =
    input.providerCredentialId ??
    accounts.find((account) => account.syncfyCredentialId)
      ?.syncfyCredentialId ??
    transactions[0]?.syncfyCredentialId;

  if (!providerCredentialId) {
    throw new HttpError(502, "Syncfy event is missing id_credential");
  }

  const userId =
    input.userId ??
    (await findFlowLedgerUserIdForSyncfyUser(input.idUser)) ??
    (await findFlowLedgerUserIdForSyncfyCredential(providerCredentialId));

  if (!userId) {
    throw new HttpError(404, "FlowLedger user was not found for Syncfy event");
  }

  console.info("[SYNCFY IMPORT] Fetched provider data", {
    eventId: input.eventId,
    providerCredentialId,
    userId,
    importedAccountCount: accounts.length,
    importedTransactionCount: transactions.length,
    fetchedAccountsCount: accounts.length,
    fetchedTransactionsCount: transactions.length,
    newTransactionCount: newTransactionsCount,
    insertedOrUpdatedImportedTransactionsCount:
      transactionWriteSummary.insertedOrUpdatedImportedTransactions,
    skippedDuplicateTransactionsCount:
      transactionWriteSummary.skippedDuplicateTransactions
  });

  if (transactions.length === 0) {
    console.info("[SYNCFY IMPORT] Transaction endpoint returned no rows", {
      eventId: input.eventId,
      providerCredentialId,
      accountEndpointCount: accountEndpoints.length,
      transactionEndpointCount: transactionEndpoints.length,
      fetchedAccountsCount: accounts.length,
      fetchedTransactionsCount: transactions.length
    });
  }

  const connection = await upsertProviderConnection({
    userId,
    providerUserId: input.idUser,
    providerCredentialId,
    endpoints: input.endpoints
  });

  const accountRefs = await upsertProviderAccounts({
    userId,
    connectionId: connection.id,
    providerUserId: input.idUser,
    accounts
  });

  const existingAccountRefs = await findProviderAccountRefs({
    providerCredentialId,
    providerAccountIds: transactions.map(
      (transaction) => transaction.syncfyAccountId
    )
  });

  for (const [key, value] of existingAccountRefs) {
    accountRefs.set(key, value);
  }

  for (const transaction of transactions) {
    if (existingTransactionIds.has(transaction.syncfyTransactionId)) {
      continue;
    }

    const providerAccountRefId = accountRefs.get(
      providerAccountKey(
        transaction.syncfyCredentialId,
        transaction.syncfyAccountId
      )
    );

    try {
      await prisma.providerImportedTransaction.create({
        data: {
          userId,
          connectionId: connection.id,
          providerAccountRefId,
          provider: "syncfy",
          providerUserId: input.idUser,
          providerTransactionId: transaction.syncfyTransactionId,
          providerCredentialId: transaction.syncfyCredentialId,
          providerAccountId: transaction.syncfyAccountId,
          description: transaction.description,
          amount: new Prisma.Decimal(transaction.amount),
          currency: transaction.currency,
          transactionDate: transaction.transactionDate,
          refreshDate: transaction.refreshDate,
          status: resolveSyncfyImportedTransactionStatus({}),
          errorMessage: null,
          rawData: transaction.rawData as Prisma.InputJsonObject
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        continue;
      }

      throw error;
    }
  }

  if (transactions.length > 0) {
    await prisma.providerImportedTransaction.updateMany({
      where: {
        provider: "syncfy",
        providerTransactionId: {
          in: transactions.map((transaction) => transaction.syncfyTransactionId)
        },
        status: "imported",
        transactionId: null
      },
      data: {
        status: "pending",
        errorMessage: null
      }
    });

    await prisma.providerImportedTransaction.updateMany({
      where: {
        provider: "syncfy",
        providerTransactionId: {
          in: transactions.map((transaction) => transaction.syncfyTransactionId)
        },
        status: "imported",
        transactionId: { not: null }
      },
      data: {
        status: "processed",
        errorMessage: null
      }
    });
  }

  /*
    Existing providerTransactionId rows are intentionally not rewritten here.
    Their status/category/transaction link represent user review decisions.
  */
  /*
    Kept as explicit variables for operational logs and API summaries.
  */
  const insertedOrUpdatedImportedTransactions =
    transactionWriteSummary.insertedOrUpdatedImportedTransactions;
  const skippedDuplicateTransactions =
    transactionWriteSummary.skippedDuplicateTransactions;

  await notifyNewImportedTransactions({
    userId,
    providerCredentialId,
    newTransactionsCount
  });

  if (input.eventId) {
    await prisma.providerWebhookEvent.update({
      where: { id: input.eventId },
      data: {
        status: "processed",
        processedAt: new Date(),
        errorMessage: null
      }
    });
  }

  return {
    status: "processed" as const,
    importedAccounts: accounts.length,
    importedTransactions: transactions.length,
    insertedOrUpdatedImportedTransactions,
    skippedDuplicateTransactions,
    refreshAttemptCount: 1,
    balanceFingerprint
  };
}

function wait(ms: number) {
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function processSyncfyCredentialRefreshWithRetry(input: {
  idUser: string;
  userId: string;
  providerCredentialId: string;
  endpoints: unknown;
  retryDelaysMs: readonly number[];
}) {
  const retryDelaysMs = input.retryDelaysMs.length > 0 ? input.retryDelaysMs : [0];
  let previousFetchedTransactionsCount: number | undefined;
  let previousBalanceFingerprint: string | undefined;
  let latestResult: SyncfyProcessingSummary | undefined;

  for (const [attemptIndex, delayMs] of retryDelaysMs.entries()) {
    await wait(delayMs);

    const result = await processSyncfyCredentialRefresh({
      idUser: input.idUser,
      userId: input.userId,
      providerCredentialId: input.providerCredentialId,
      endpoints: input.endpoints
    });
    const balanceFingerprint =
      result.balanceFingerprint ?? syncfyBalanceFingerprint([]);
    latestResult = {
      ...result,
      refreshAttemptCount: attemptIndex + 1
    };

    console.info("[SYNCFY REFRESH] Credential refresh attempt completed", {
      providerCredentialId: input.providerCredentialId,
      userId: input.userId,
      attempt: attemptIndex + 1,
      maxAttempts: retryDelaysMs.length,
      fetchedAccountsCount: result.importedAccounts,
      fetchedTransactionsCount: result.importedTransactions,
      insertedOrUpdatedImportedTransactionsCount:
        result.insertedOrUpdatedImportedTransactions ?? 0,
      skippedDuplicateTransactionsCount:
        result.skippedDuplicateTransactions ?? 0,
      fetchedTransactionCountChanged:
        previousFetchedTransactionsCount !== undefined &&
        previousFetchedTransactionsCount !== result.importedTransactions,
      externalBalancesChanged:
        previousBalanceFingerprint !== undefined &&
        previousBalanceFingerprint !== balanceFingerprint
    });

    if (
      shouldStopSyncfyRefreshRetry({
        attemptIndex,
        totalAttempts: retryDelaysMs.length,
        previousFetchedTransactionsCount,
        previousBalanceFingerprint,
        fetchedTransactionsCount: result.importedTransactions,
        balanceFingerprint,
        insertedOrUpdatedImportedTransactions:
          result.insertedOrUpdatedImportedTransactions ?? 0
      })
    ) {
      break;
    }

    previousFetchedTransactionsCount = result.importedTransactions;
    previousBalanceFingerprint = balanceFingerprint;
  }

  if (!latestResult) {
    throw new HttpError(500, "Syncfy refresh did not run");
  }

  return latestResult;
}

export async function processSyncfyWebhookEvent(
  eventId: string,
  event: SyncfyWebhookEventInput
): Promise<SyncfyProcessingSummary> {
  const claimResult = await prisma.providerWebhookEvent.updateMany({
    where: {
      id: eventId,
      status: "received"
    },
    data: {
      status: "processing",
      processedAt: null,
      errorMessage: null
    }
  });

  if (claimResult.count === 0) {
    return {
      status: "ignored",
      importedAccounts: 0,
      importedTransactions: 0,
      insertedOrUpdatedImportedTransactions: 0,
      skippedDuplicateTransactions: 0
    };
  }

  if (event.header.event.name !== "credentials.refreshed") {
    console.info("[SYNCFY WEBHOOK] Ignoring unsupported event", {
      eventId,
      eventName: event.header.event.name ?? "unknown",
      providerCredentialId: event.payload.id_credential
    });

    await prisma.providerWebhookEvent.update({
      where: { id: eventId },
      data: {
        status: "ignored",
        processedAt: new Date()
      }
    });

    return {
      status: "ignored",
      importedAccounts: 0,
      importedTransactions: 0,
      insertedOrUpdatedImportedTransactions: 0,
      skippedDuplicateTransactions: 0
    };
  }

  const idUser = event.header.user.id_user;
  if (!idUser) throw new HttpError(400, "Syncfy event is missing id_user");

  console.info("[SYNCFY WEBHOOK] Processing event", {
    eventId,
    eventName: event.header.event.name,
    providerCredentialId: event.payload.id_credential
  });

  return processSyncfyCredentialRefresh({
    eventId,
    idUser,
    providerCredentialId: event.payload.id_credential,
    endpoints: event.payload.endpoints
  });
}

export async function resyncSyncfyConnection(input: {
  userId: string;
  connectionId: string;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
}): Promise<SyncfyResyncSummary> {
  const connection = await prisma.providerConnection.findFirst({
    where: {
      id: input.connectionId,
      userId: input.userId,
      provider: "syncfy"
    }
  });

  if (!connection) {
    throw new HttpError(404, "Syncfy connection was not found");
  }

  const storedMetadata = getSyncfyRefreshMetadata(connection.rawData);
  const legacyRawData = getJsonObject(connection.rawData);
  const endpoints = storedMetadata?.endpoints ?? legacyRawData?.endpoints;
  const providerUserId =
    storedMetadata?.providerUserId ?? connection.providerUserId;
  const endpointSummary = summarizeSyncfyEndpoints(endpoints);

  console.info("[SYNCFY REFRESH] Loaded stored endpoint metadata", {
    providerCredentialId: connection.providerCredentialId,
    userId: input.userId,
    hasStoredRefreshMetadata: Boolean(storedMetadata?.endpoints),
    endpointTypes: endpointSummary.endpointTypes,
    accountEndpointCount: endpointSummary.accountEndpointCount,
    transactionEndpointCount: endpointSummary.transactionEndpointCount
  });

  if (!providerUserId || !endpoints) {
    const failureReason =
      "Stored Syncfy refresh metadata is unavailable. Manual reconnect is required.";
    await markSyncfyCredentialManualReconnect({
      userId: input.userId,
      connectionId: connection.id,
      providerCredentialId: connection.providerCredentialId,
      failureReason
    });

    return {
      status: "manual_reconnect_required",
      importedAccounts: 0,
      importedTransactions: 0,
      requiresManualReconnect: true,
      failureReason
    };
  }

  try {
    const refresh =
      input.retryDelaysMs && input.retryDelaysMs.length > 0
        ? processSyncfyCredentialRefreshWithRetry({
            idUser: providerUserId,
            userId: input.userId,
            providerCredentialId: connection.providerCredentialId,
            endpoints,
            retryDelaysMs: input.retryDelaysMs
          })
        : processSyncfyCredentialRefresh({
            idUser: providerUserId,
            userId: input.userId,
            providerCredentialId: connection.providerCredentialId,
            endpoints
          });
    const result = input.timeoutMs
      ? await withTimeout(refresh, input.timeoutMs)
      : await refresh;

    console.info("[SYNCFY REFRESH] Completed credential refresh", {
      providerCredentialId: connection.providerCredentialId,
      userId: input.userId,
      fetchedAccountsCount: result.importedAccounts,
      fetchedTransactionsCount: result.importedTransactions,
      insertedOrUpdatedImportedTransactionsCount:
        result.insertedOrUpdatedImportedTransactions ?? 0,
      skippedDuplicateTransactionsCount:
        result.skippedDuplicateTransactions ?? 0,
      refreshAttemptCount: result.refreshAttemptCount ?? 1
    });

    return {
      status: "processed",
      importedAccounts: result.importedAccounts,
      importedTransactions: result.importedTransactions,
      insertedOrUpdatedImportedTransactions:
        result.insertedOrUpdatedImportedTransactions,
      skippedDuplicateTransactions: result.skippedDuplicateTransactions,
      refreshAttemptCount: result.refreshAttemptCount,
      requiresManualReconnect: false
    };
  } catch (error) {
    const failureReason = safeFailureReason(error);
    const requiresManualReconnect = shouldMarkSyncfyManualReconnect(error);

    if (requiresManualReconnect) {
      await markSyncfyCredentialManualReconnect({
        userId: input.userId,
        connectionId: connection.id,
        providerCredentialId: connection.providerCredentialId,
        failureReason
      });

      return {
        status: "manual_reconnect_required",
        importedAccounts: 0,
        importedTransactions: 0,
        requiresManualReconnect: true,
        failureReason
      };
    }

    await prisma.providerConnection.update({
      where: { id: connection.id },
      data: {
        status: "sync_failed",
        failureReason,
        requiresManualReconnect: false,
        lastSyncFailureAt: new Date()
      }
    });
    console.warn("[SYNCFY REFRESH] Credential refresh failed", {
      providerCredentialId: connection.providerCredentialId,
      userId: input.userId,
      requiresManualReconnect: false,
      failureReason
    });
    throw error;
  }
}

export async function resyncSyncfyCredential(input: {
  userId: string;
  providerCredentialId: string;
  timeoutMs?: number;
  retryDelaysMs?: readonly number[];
}): Promise<SyncfyResyncSummary> {
  const connection = await prisma.providerConnection.findFirst({
    where: {
      userId: input.userId,
      provider: "syncfy",
      providerCredentialId: input.providerCredentialId
    },
    select: { id: true }
  });

  if (!connection) {
    throw new HttpError(404, "Syncfy credential connection was not found");
  }

  console.info("[SYNCFY REFRESH] Starting credential refresh fallback", {
    providerCredentialId: input.providerCredentialId,
    userId: input.userId
  });

  return resyncSyncfyConnection({
    userId: input.userId,
    connectionId: connection.id,
    timeoutMs: input.timeoutMs,
    retryDelaysMs: input.retryDelaysMs
  });
}

export function getManualSyncfyRefreshRetryDelaysMs() {
  return [...manualSyncfyRefreshRetryDelaysMs];
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new HttpError(504, "Syncfy resync timed out"));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

export async function markSyncfyWebhookEventFailed(
  eventId: string,
  error: unknown
) {
  const message = error instanceof Error ? error.message : "Unknown error";

  console.error("[SYNCFY WEBHOOK] Processing failed", {
    eventId,
    error: message
  });

  await prisma.providerWebhookEvent.update({
    where: { id: eventId },
    data: {
      status: "failed",
      processedAt: new Date(),
      errorMessage: message.slice(0, 1000)
    }
  });
}
