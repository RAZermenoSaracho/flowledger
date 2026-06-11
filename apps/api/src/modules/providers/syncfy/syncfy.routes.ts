import { Prisma } from "@prisma/client";
import { Router } from "express";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../../../config/env.js";
import { prisma } from "../../../db/prisma.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { syncfyProvider } from "./syncfy.adapter.js";
import { verifySyncfyWebhookSignature } from "./syncfy.webhookSecurity.js";

const router = Router();

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

function logWebhookInDevelopment(rid: string | undefined, eventCount: number) {
  if (env.NODE_ENV !== "development") return;

  console.log("[SYNCFY WEBHOOK RECEIVED]", { rid, eventCount });
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function rawBodyString(rawBody: Buffer | undefined) {
  return rawBody?.toString("utf8") ?? "";
}

function generatedEventEid(
  rid: string | undefined,
  event: SyncfyWebhookEvent,
  index: number
) {
  const hash = createHmac("sha256", "flowledger-syncfy-generated-eid")
    .update(JSON.stringify(event))
    .digest("hex")
    .slice(0, 16);

  return `generated:${rid ?? "no-rid"}:${index}:${hash}`;
}

function getHeaderString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function findFlowLedgerUserIdForSyncfyUser(syncfyUserId?: string) {
  if (!syncfyUserId) return undefined;

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

async function recordSyncfyEvent(
  rid: string | undefined,
  event: SyncfyWebhookEvent,
  rawHeaders: Prisma.InputJsonValue,
  rawBody: string,
  index: number
) {
  const eventEid =
    event.header.event.eid ?? generatedEventEid(rid, event, index);
  const userId = await findFlowLedgerUserIdForSyncfyUser(
    event.header.user.id_user
  );
  const data = {
    userId,
    provider: "syncfy",
    rid,
    providerEventId: eventEid,
    eventName: event.header.event.name ?? "unknown",
    providerUserId: event.header.user.id_user,
    providerExternalId: event.header.user.id_external,
    providerCredentialId: event.payload.id_credential,
    rawPayload: toJsonValue(event),
    rawHeaders,
    rawBody,
    status: "received",
    processedAt: null,
    errorMessage: null
  };

  try {
    const recordedEvent = await prisma.providerWebhookEvent.create({
      data
    });

    return { recordedEvent, shouldProcess: true };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const recordedEvent = await prisma.providerWebhookEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: "syncfy",
            providerEventId: eventEid
          }
        }
      });

      if (recordedEvent) return { recordedEvent, shouldProcess: false };
    }

    throw error;
  }
}

async function recordInvalidSyncfyWebhook(
  rawBody: unknown,
  rawHeaders: Prisma.InputJsonValue,
  rawBodyText: string,
  eventName: string,
  errorMessage: string
) {
  return prisma.providerWebhookEvent.create({
    data: {
      provider: "syncfy",
      providerEventId: `invalid:${randomUUID()}`,
      eventName,
      rawPayload: toJsonValue(rawBody),
      rawHeaders,
      rawBody: rawBodyText,
      status: "failed",
      processedAt: new Date(),
      errorMessage: errorMessage.slice(0, 1000)
    }
  });
}

function processRecordedEvent(eventId: string, event: SyncfyWebhookEvent) {
  if (!syncfyProvider.handleWebhook) return;

  void syncfyProvider
    .handleWebhook({ eventId, payload: event })
    .catch(() => undefined);
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
    const rawHeaders = toJsonValue(req.headers);
    const rawBody = rawBodyString(req.rawBody);
    const signatureVerification = verifySyncfyWebhookSignature({
      rawBody: req.rawBody,
      signature: getHeaderString(req.headers["request-signature"]),
      signatureKey: env.SYNCFY_WEBHOOK_SIGNATURE_KEY
    });

    if (signatureVerification === "invalid") {
      await recordInvalidSyncfyWebhook(
        req.body,
        rawHeaders,
        rawBody,
        "invalid_signature",
        "Syncfy webhook request-signature validation failed."
      ).catch(() => undefined);

      res.status(200).json({
        success: true,
        acceptedEvents: 0
      });
      return;
    }

    const parsedWebhook = syncfyWebhookSchema.safeParse(req.body);

    if (!parsedWebhook.success) {
      await recordInvalidSyncfyWebhook(
        req.body,
        rawHeaders,
        rawBody,
        "invalid",
        parsedWebhook.error.message
      ).catch(() => undefined);

      res.status(200).json({
        success: true,
        acceptedEvents: 0
      });
      return;
    }

    const webhook = parsedWebhook.data;
    logWebhookInDevelopment(webhook.rid, webhook.events.length);

    const recordResults = await Promise.allSettled(
      webhook.events.map(async (event, index) => ({
        event,
        recordedEventResult: await recordSyncfyEvent(
          webhook.rid,
          event,
          rawHeaders,
          rawBody,
          index
        )
      }))
    );
    const recordedEvents = recordResults.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );

    res.status(200).json({
      success: true,
      rid: webhook.rid,
      signatureVerification,
      acceptedEvents: recordedEvents.length
    });

    recordedEvents.forEach(({ event, recordedEventResult }) => {
      if (!recordedEventResult.shouldProcess) return;

      processRecordedEvent(recordedEventResult.recordedEvent.id, event);
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
