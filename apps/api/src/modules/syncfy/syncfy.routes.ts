import { Router } from "express";
import { z } from "zod";
import { env } from "../../config/env.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../utils/httpError.js";

const router = Router();
const syncfyBaseUrl = "https://sync.paybook.com";

const syncfyWebhookEventSchema = z.object({
  header: z.object({
    event: z.object({
      eid: z.string().optional(),
      name: z.string().optional()
    }),
    user: z.object({
      id_user: z.string().optional(),
      id_external: z.string().optional()
    })
  }),
  payload: z
    .object({
      id_credential: z.string().optional(),
      endpoints: z.unknown().optional()
    })
    .passthrough()
});

const syncfyWebhookSchema = z.object({
  rid: z.string().optional(),
  events: z.array(syncfyWebhookEventSchema).default([])
});

type SyncfyWebhookEvent = z.infer<typeof syncfyWebhookEventSchema>;

type SyncfyEventSummary = {
  rid?: string;
  eid?: string;
  name?: string;
  idUser?: string;
  idExternal?: string;
  idCredential?: string;
  endpoints: unknown;
  importedTransactions: number;
};

function logWebhookInDevelopment(headers: unknown, body: unknown) {
  if (env.NODE_ENV !== "development") return;

  console.log("[SYNCFY WEBHOOK HEADERS]", JSON.stringify(headers, null, 2));
  console.log("[SYNCFY WEBHOOK BODY]", JSON.stringify(body, null, 2));
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

function buildSyncfyUrl(endpoint: string, token: string) {
  const url = new URL(endpoint, syncfyBaseUrl);

  if (url.origin !== syncfyBaseUrl) {
    throw new HttpError(400, "Unexpected Syncfy endpoint host");
  }

  url.searchParams.set("token", token);
  return url;
}

function getJsonObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function extractSyncfyToken(responseBody: unknown) {
  const body = getJsonObject(responseBody);
  const response = getJsonObject(body?.response);
  const token = body?.token ?? response?.token;

  return typeof token === "string" ? token : undefined;
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

async function createSyncfySessionToken(idUser: string) {
  if (!env.SYNCFY_API_KEY) {
    throw new HttpError(500, "Syncfy API key is not configured");
  }

  const url = new URL("/v1/sessions", syncfyBaseUrl);
  url.searchParams.set("api_key", env.SYNCFY_API_KEY);
  url.searchParams.set("id_user", idUser);

  const body = await fetchJson(url, { method: "POST" });
  const token = extractSyncfyToken(body);

  if (!token) {
    throw new HttpError(502, "Syncfy session response did not include a token");
  }

  return token;
}

async function fetchTransactionsForRefreshedEvent(
  event: SyncfyWebhookEvent
): Promise<unknown[]> {
  const idUser = event.header.user.id_user;
  if (!idUser) throw new HttpError(400, "Syncfy event is missing id_user");

  const endpoint = getFirstTransactionEndpoint(event.payload.endpoints);
  if (!endpoint) return [];

  const token = await createSyncfySessionToken(idUser);
  const url = buildSyncfyUrl(endpoint, token);
  const body = await fetchJson(url);

  return extractSyncfyTransactions(body);
}

async function processSyncfyEvent(
  rid: string | undefined,
  event: SyncfyWebhookEvent
): Promise<SyncfyEventSummary> {
  const summary: SyncfyEventSummary = {
    rid,
    eid: event.header.event.eid,
    name: event.header.event.name,
    idUser: event.header.user.id_user,
    idExternal: event.header.user.id_external,
    idCredential: event.payload.id_credential,
    endpoints: event.payload.endpoints,
    importedTransactions: 0
  };

  if (event.header.event.name !== "credentials.refreshed") return summary;

  const transactions = await fetchTransactionsForRefreshedEvent(event);
  summary.importedTransactions = transactions.length;

  if (env.NODE_ENV === "development") {
    console.log("[SYNCFY TRANSACTIONS PARSED]", {
      eid: summary.eid,
      idCredential: summary.idCredential,
      count: transactions.length
    });
  }

  return summary;
}

/**
 * Health check
 */
router.get("/health", async (_req, res) => {
  res.json({
    success: true,
    service: "syncfy",
    timestamp: new Date().toISOString()
  });
});

/**
 * Webhook endpoint
 */
router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    logWebhookInDevelopment(req.headers, req.body);

    const webhook = syncfyWebhookSchema.parse(req.body);
    const events = await Promise.all(
      webhook.events.map((event) => processSyncfyEvent(webhook.rid, event))
    );

    res.status(200).json({
      success: true,
      rid: webhook.rid,
      processedEvents: events.length,
      events
    });
  })
);

router.get("/webhook", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "Syncfy webhook endpoint is alive. Use POST for events."
  });
});

export default router;
