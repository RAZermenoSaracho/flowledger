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

  const milliseconds = timestamp > 10_000_000_000 ? timestamp : timestamp * 1000;
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
  if (!env.SYNCFY_API_KEY) {
    throw new HttpError(500, "Syncfy API key is not configured");
  }

  const url = new URL("/v1/sessions", syncfyApiBaseUrl);
  url.searchParams.set("api_key", env.SYNCFY_API_KEY);

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
    syncfyAccountId: requiredString(rawData, ["id_account", "id"], "id_account"),
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
    await prisma.syncfyWebhookEvent.update({
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

  const endpoint = getFirstTransactionEndpoint(event.payload.endpoints);
  if (!endpoint) {
    await prisma.syncfyWebhookEvent.update({
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
    await prisma.syncfyImportedTransaction.upsert({
      where: { syncfyTransactionId: transaction.syncfyTransactionId },
      create: {
        syncfyTransactionId: transaction.syncfyTransactionId,
        syncfyCredentialId: transaction.syncfyCredentialId,
        syncfyAccountId: transaction.syncfyAccountId,
        description: transaction.description,
        amount: new Prisma.Decimal(transaction.amount),
        currency: transaction.currency,
        transactionDate: transaction.transactionDate,
        refreshDate: transaction.refreshDate,
        rawData: transaction.rawData as Prisma.InputJsonObject
      },
      update: {
        syncfyCredentialId: transaction.syncfyCredentialId,
        syncfyAccountId: transaction.syncfyAccountId,
        description: transaction.description,
        amount: new Prisma.Decimal(transaction.amount),
        currency: transaction.currency,
        transactionDate: transaction.transactionDate,
        refreshDate: transaction.refreshDate,
        rawData: transaction.rawData as Prisma.InputJsonObject
      }
    });
  }

  await prisma.syncfyWebhookEvent.update({
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

  await prisma.syncfyWebhookEvent.update({
    where: { id: eventId },
    data: {
      status: "failed",
      processedAt: new Date(),
      errorMessage: message.slice(0, 1000)
    }
  });
}
