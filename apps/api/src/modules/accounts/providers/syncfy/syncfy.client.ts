import { HttpError } from "../../../../utils/httpError.js";
import type {
  NormalizedSyncfyAccount,
  NormalizedSyncfyInstitution,
  NormalizedSyncfyTransaction,
  SyncfyUser
} from "./types/syncfy.types.js";
import {
  buildSyncfyApiUrl,
  buildSyncfyDataUrl,
  extractSyncfyList,
  extractSyncfyToken,
  extractSyncfyUser,
  fetchJson,
  getJsonObject,
  getNumber,
  getString,
  requiredString,
  requiredNumber,
  uniqueStrings,
  unixTimestampToDate
} from "./utils/syncfyHttp.js";
import { buildSyncfyTransactionDataUrl } from "./utils/syncfyEndpoints.js";

const syncfyTransactionPageLimit = 500;

/** Opens a Syncfy session for a Syncfy user id, returning the token used to authorize subsequent data-endpoint calls. */
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

/** Looks up a Syncfy user by the FlowLedger-assigned external user id; returns `undefined` if none exists yet. */
export async function fetchSyncfyUserByExternalId(externalUserId: string) {
  const url = buildSyncfyApiUrl("/v1/users");
  url.searchParams.set("id_external", externalUserId);

  const body = await fetchJson(url);
  const [user] = extractSyncfyList(body, "users").map(normalizeSyncfyUser);

  return user;
}

/** Creates a new Syncfy user linked to a FlowLedger external user id. */
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

/** Normalizes a raw Syncfy account payload; `fallbackCredentialId` covers responses that omit `id_credential`. */
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

/** Normalizes a raw Syncfy institution (site) payload, deriving `supportedAccountTypes` from its product list plus category. */
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

/** Normalizes a raw Syncfy transaction payload; throws if it lacks a resolvable `id_credential` (from the payload or `fallbackCredentialId`). */
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

/** Fetches a Syncfy accounts data endpoint and returns the normalized accounts. */
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

/** Fetches a Syncfy transactions data endpoint, paging with `skip`/`limit` until a short page is returned, and returns all normalized transactions. */
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
