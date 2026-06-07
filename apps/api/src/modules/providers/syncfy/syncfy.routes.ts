import { Prisma } from "@prisma/client";
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../../../config/env.js";
import { prisma } from "../../../db/prisma.js";
import { asyncHandler } from "../../../utils/asyncHandler.js";
import { syncfyProvider } from "./syncfy.adapter.js";

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

function generatedEventEid(rid: string | undefined, index: number) {
  return `generated:${rid ?? "no-rid"}:${index}:${randomUUID()}`;
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
  index: number
) {
  const eventEid = event.header.event.eid ?? generatedEventEid(rid, index);
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
    status: "received",
    processedAt: null,
    errorMessage: null
  };

  return prisma.providerWebhookEvent.upsert({
    where: {
      provider_providerEventId: {
        provider: "syncfy",
        providerEventId: eventEid
      }
    },
    create: data,
    update: data
  });
}

async function recordInvalidSyncfyWebhook(
  rawBody: unknown,
  rawHeaders: Prisma.InputJsonValue,
  error: z.ZodError
) {
  return prisma.providerWebhookEvent.create({
    data: {
      provider: "syncfy",
      providerEventId: `invalid:${randomUUID()}`,
      eventName: "invalid",
      rawPayload: toJsonValue(rawBody),
      rawHeaders,
      status: "failed",
      processedAt: new Date(),
      errorMessage: error.message.slice(0, 1000)
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
    const parsedWebhook = syncfyWebhookSchema.safeParse(req.body);

    if (!parsedWebhook.success) {
      await recordInvalidSyncfyWebhook(
        req.body,
        rawHeaders,
        parsedWebhook.error
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
        recordedEvent: await recordSyncfyEvent(
          webhook.rid,
          event,
          rawHeaders,
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
      acceptedEvents: recordedEvents.length
    });

    recordedEvents.forEach(({ event, recordedEvent }) => {
      processRecordedEvent(recordedEvent.id, event);
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
