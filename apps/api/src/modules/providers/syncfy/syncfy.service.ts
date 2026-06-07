import { Prisma } from "@prisma/client";
import { env } from "../../../config/env.js";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";

const syncfyApiBaseUrl = "https://api.syncfy.com";
const syncfyDataBaseUrl = "https://sync.paybook.com";

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
  logoUrl: string | null;
  country: string | null;
  category: "bank" | "broker" | "exchange" | "wallet" | "government" | "other";
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
  importedTransactions: number;
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

function getStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => getString(item))
      .filter((item): item is string => Boolean(item));
  }

  const stringValue = getString(value);
  return stringValue ? [stringValue] : [];
}

function uniq(values: string[]) {
  return Array.from(new Set(values));
}

function requiredString(record: JsonRecord, keys: string[], fieldName: string) {
  for (const key of keys) {
    const value = getString(record[key]);
    if (value) return value;
  }

  throw new HttpError(502, `Syncfy transaction is missing ${fieldName}`);
}

function requiredNumber(record: JsonRecord, keys: string[], fieldName: string) {
  for (const key of keys) {
    const value = getNumber(record[key]);
    if (value !== undefined) return value;
  }

  throw new HttpError(502, `Syncfy transaction is missing ${fieldName}`);
}

function unixTimestampToDate(value: unknown, fieldName: string) {
  const timestamp = getNumber(value);
  if (timestamp === undefined) {
    throw new HttpError(502, `Syncfy transaction is missing ${fieldName}`);
  }

  const milliseconds =
    timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(502, `Syncfy transaction has invalid ${fieldName}`);
  }

  return date;
}

function extractSyncfyToken(responseBody: unknown) {
  const body = getJsonObject(responseBody);
  const response = getJsonObject(body?.response);
  const token = body?.token ?? response?.token;

  return getString(token);
}

function extractSyncfyTransactions(responseBody: unknown): unknown[] {
  if (Array.isArray(responseBody)) return responseBody;

  const body = getJsonObject(responseBody);
  const response = body?.response;

  if (Array.isArray(response)) return response;
  const responseObject = getJsonObject(response);
  if (Array.isArray(responseObject?.transactions)) {
    return responseObject.transactions;
  }
  if (Array.isArray(body?.transactions)) return body.transactions;

  return [];
}

function extractSyncfyAccounts(responseBody: unknown): unknown[] {
  if (Array.isArray(responseBody)) return responseBody;

  const body = getJsonObject(responseBody);
  const response = body?.response;

  if (Array.isArray(response)) return response;
  const responseObject = getJsonObject(response);
  if (Array.isArray(responseObject?.accounts)) {
    return responseObject.accounts;
  }
  if (Array.isArray(body?.accounts)) return body.accounts;

  return [];
}

function extractSyncfyInstitutions(responseBody: unknown): unknown[] {
  if (Array.isArray(responseBody)) return responseBody;

  const body = getJsonObject(responseBody);
  const response = body?.response;

  if (Array.isArray(response)) return response;
  const responseObject = getJsonObject(response);
  if (Array.isArray(responseObject?.sites)) return responseObject.sites;
  if (Array.isArray(responseObject?.institutions)) {
    return responseObject.institutions;
  }
  if (Array.isArray(body?.sites)) return body.sites;
  if (Array.isArray(body?.institutions)) return body.institutions;

  return [];
}

function extractSyncfyUsers(responseBody: unknown): unknown[] {
  if (Array.isArray(responseBody)) return responseBody;

  const body = getJsonObject(responseBody);
  const response = body?.response;

  if (Array.isArray(response)) return response;
  const responseObject = getJsonObject(response);
  if (Array.isArray(responseObject?.users)) return responseObject.users;
  if (Array.isArray(body?.users)) return body.users;

  return [];
}

function extractSyncfyUser(responseBody: unknown): unknown {
  const body = getJsonObject(responseBody);
  const response = getJsonObject(body?.response);

  return response ?? body ?? responseBody;
}

function getFirstTransactionEndpoint(endpoints: unknown) {
  if (!endpoints || typeof endpoints !== "object" || Array.isArray(endpoints)) {
    return undefined;
  }

  const transactions = (endpoints as { transactions?: unknown }).transactions;
  if (!Array.isArray(transactions)) return undefined;

  const [endpoint] = transactions;
  return typeof endpoint === "string" ? endpoint : undefined;
}

function buildSyncfyDataUrl(endpoint: string, token: string) {
  const url = new URL(endpoint, syncfyDataBaseUrl);

  if (url.origin !== syncfyDataBaseUrl) {
    throw new HttpError(400, "Unexpected Syncfy endpoint host");
  }

  url.searchParams.set("token", token);
  return url;
}

function buildSyncfyApiUrl(pathname: string) {
  if (!env.SYNCFY_API_KEY) {
    throw new HttpError(500, "Syncfy API key is not configured");
  }

  const url = new URL(pathname, syncfyApiBaseUrl);
  url.searchParams.set("api_key", env.SYNCFY_API_KEY);
  return url;
}

async function fetchJson(url: URL, init?: RequestInit) {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as unknown;

  if (!response.ok) {
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
  const [user] = extractSyncfyUsers(body).map((item) =>
    normalizeSyncfyUser(item)
  );

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

function normalizeInstitutionCategory(rawData: JsonRecord) {
  const values = [
    getString(rawData.type),
    getString(rawData.category),
    getString(rawData.classification),
    getString(rawData.kind),
    getString(rawData.name)
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  if (/\b(bank|banco|banking)\b/.test(values)) return "bank";
  if (/\b(broker|brokerage|inversion|investment)\b/.test(values)) {
    return "broker";
  }
  if (/\b(exchange|crypto|cripto|bitcoin)\b/.test(values)) return "exchange";
  if (/\b(wallet|digital wallet|billetera)\b/.test(values)) return "wallet";
  if (/\b(government|fiscal|tax|sat|afip)\b/.test(values)) {
    return "government";
  }

  return "other";
}

export function normalizeSyncfyInstitution(
  institution: unknown
): NormalizedSyncfyInstitution {
  const rawData = getJsonObject(institution);
  if (!rawData) {
    throw new HttpError(502, "Syncfy institution payload is not an object");
  }

  const country = getJsonObject(rawData.country);

  return {
    syncfyInstitutionId: requiredString(
      rawData,
      ["id_site", "id_institution", "institution_id", "id"],
      "id_site"
    ),
    name:
      getString(rawData.name) ??
      getString(rawData.display_name) ??
      "Syncfy institution",
    logoUrl:
      getString(rawData.logo) ??
      getString(rawData.logo_url) ??
      getString(rawData.image) ??
      getString(rawData.icon) ??
      null,
    country:
      getString(rawData.country) ??
      getString(rawData.country_code) ??
      getString(country?.code) ??
      getString(country?.name) ??
      null,
    category: normalizeInstitutionCategory(rawData),
    supportedAccountTypes: uniq([
      ...getStringList(rawData.account_types),
      ...getStringList(rawData.accountTypes),
      ...getStringList(rawData.supported_account_types),
      ...getStringList(rawData.products),
      ...getStringList(rawData.type)
    ]),
    rawData
  };
}

export function normalizeSyncfyAccount(
  account: unknown,
  fallbackCredentialId?: string
): NormalizedSyncfyAccount {
  const rawData = getJsonObject(account);
  if (!rawData) {
    throw new HttpError(502, "Syncfy account payload is not an object");
  }

  const name =
    getString(rawData.name) ??
    getString(rawData.description) ??
    getString(rawData.number) ??
    "Syncfy account";

  return {
    syncfyAccountId: requiredString(
      rawData,
      ["id_account", "id"],
      "id_account"
    ),
    syncfyCredentialId:
      getString(rawData.id_credential) ?? fallbackCredentialId,
    name,
    type: getString(rawData.type) ?? getString(rawData.account_type),
    currency: getString(rawData.currency),
    balance: getNumber(rawData.balance),
    rawData
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

  const description =
    getString(rawData.description) ??
    getString(rawData.name) ??
    getString(rawData.memo) ??
    "Syncfy transaction";

  return {
    syncfyTransactionId: requiredString(
      rawData,
      ["id_transaction", "id"],
      "id_transaction"
    ),
    syncfyCredentialId,
    syncfyAccountId: requiredString(rawData, ["id_account"], "id_account"),
    description,
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

export async function fetchSyncfyInstitutions() {
  const url = buildSyncfyApiUrl("/v1/catalogues/sites");
  const body = await fetchJson(url);

  return extractSyncfyInstitutions(body).map((institution) =>
    normalizeSyncfyInstitution(institution)
  );
}

export async function fetchSyncfyAccounts(
  endpoint: string,
  token: string,
  fallbackCredentialId?: string
) {
  const url = buildSyncfyDataUrl(endpoint, token);
  const body = await fetchJson(url);

  return extractSyncfyAccounts(body).map((account) =>
    normalizeSyncfyAccount(account, fallbackCredentialId)
  );
}

export async function fetchSyncfyTransactions(
  endpoint: string,
  token: string,
  fallbackCredentialId?: string
) {
  const url = buildSyncfyDataUrl(endpoint, token);
  const body = await fetchJson(url);

  return extractSyncfyTransactions(body).map((transaction) =>
    normalizeSyncfyTransaction(transaction, fallbackCredentialId)
  );
}

export async function processSyncfyWebhookEvent(
  eventId: string,
  event: SyncfyWebhookEventInput
): Promise<SyncfyProcessingSummary> {
  if (event.header.event.name !== "credentials.refreshed") {
    await prisma.providerWebhookEvent.update({
      where: { id: eventId },
      data: {
        status: "ignored",
        processedAt: new Date()
      }
    });

    return { status: "ignored", importedTransactions: 0 };
  }

  const idUser = event.header.user.id_user;
  if (!idUser) throw new HttpError(400, "Syncfy event is missing id_user");

  const userId = await findFlowLedgerUserIdForSyncfyUser(idUser);
  const endpoint = getFirstTransactionEndpoint(event.payload.endpoints);
  if (!endpoint) {
    await prisma.providerWebhookEvent.update({
      where: { id: eventId },
      data: {
        status: "processed",
        processedAt: new Date()
      }
    });

    return { status: "processed", importedTransactions: 0 };
  }

  const { token } = await createSyncfySession(idUser);
  const transactions = await fetchSyncfyTransactions(
    endpoint,
    token,
    event.payload.id_credential
  );

  for (const transaction of transactions) {
    await prisma.providerImportedTransaction.upsert({
      where: {
        provider_providerTransactionId: {
          provider: "syncfy",
          providerTransactionId: transaction.syncfyTransactionId
        }
      },
      create: {
        userId,
        provider: "syncfy",
        providerUserId: idUser,
        providerTransactionId: transaction.syncfyTransactionId,
        providerCredentialId: transaction.syncfyCredentialId,
        providerAccountId: transaction.syncfyAccountId,
        description: transaction.description,
        amount: new Prisma.Decimal(transaction.amount),
        currency: transaction.currency,
        transactionDate: transaction.transactionDate,
        refreshDate: transaction.refreshDate,
        status: "imported",
        errorMessage: null,
        rawData: transaction.rawData as Prisma.InputJsonObject
      },
      update: {
        userId,
        providerUserId: idUser,
        providerCredentialId: transaction.syncfyCredentialId,
        providerAccountId: transaction.syncfyAccountId,
        description: transaction.description,
        amount: new Prisma.Decimal(transaction.amount),
        currency: transaction.currency,
        transactionDate: transaction.transactionDate,
        refreshDate: transaction.refreshDate,
        status: "imported",
        errorMessage: null,
        rawData: transaction.rawData as Prisma.InputJsonObject
      }
    });
  }

  await prisma.providerWebhookEvent.update({
    where: { id: eventId },
    data: {
      status: "processed",
      processedAt: new Date(),
      errorMessage: null
    }
  });

  return { status: "processed", importedTransactions: transactions.length };
}

export async function markSyncfyWebhookEventFailed(
  eventId: string,
  error: unknown
) {
  const message = error instanceof Error ? error.message : "Unknown error";

  await prisma.providerWebhookEvent.update({
    where: { id: eventId },
    data: {
      status: "failed",
      processedAt: new Date(),
      errorMessage: message.slice(0, 1000)
    }
  });
}
