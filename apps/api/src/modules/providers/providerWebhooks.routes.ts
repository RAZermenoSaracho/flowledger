import { providerWebhookParamsSchema } from "@flowledger/shared";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import type { ProviderKey } from "./provider.types.js";
import { getProvider } from "./providerRegistry.js";
import {
  getSyncfyWebhookSignatureDiagnostics,
  verifySyncfyWebhookSignature
} from "./syncfy/syncfy.webhookSecurity.js";

export const providerWebhooksRouter = Router();

export const syncfyWebhookEventSchema = z.object({
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

export const syncfyWebhookSchema = z.object({
  rid: z.string().optional(),
  events: z.array(syncfyWebhookEventSchema).default([])
});

type SyncfyWebhookEvent = z.infer<typeof syncfyWebhookEventSchema>;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function sanitizeWebhookHeaders(
  headers: Record<string, string | string[] | undefined>
): Prisma.InputJsonValue {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    const headerValue = Array.isArray(value) ? value[0] : value;

    if (
      lowerKey === "request-signature" ||
      lowerKey === "request_signature" ||
      lowerKey === "x-request-signature" ||
      lowerKey === "x-syncfy-signature" ||
      lowerKey === "x-paybook-signature" ||
      lowerKey === "authorization" ||
      lowerKey === "cookie"
    ) {
      sanitized[lowerKey] = {
        redacted: true,
        present: Boolean(headerValue),
        length: headerValue?.length ?? 0
      };
      continue;
    }

    sanitized[lowerKey] = value;
  }

  return toJsonValue(sanitized);
}

function rawBodyString(rawBody: Buffer | undefined) {
  return rawBody?.toString("utf8") ?? "";
}

export function generatedSyncfyEventEid(
  rid: string | undefined,
  event: SyncfyWebhookEvent,
  index: number
) {
  const hash = createHmac("sha256", "flowledger-provider-generated-eid")
    .update(JSON.stringify(event))
    .digest("hex")
    .slice(0, 16);

  return `generated:${rid ?? "no-rid"}:${index}:${hash}`;
}

function getHeaderString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function findSyncfySignatureHeader(
  headers: Record<string, string | string[] | undefined>
) {
  const supportedHeaderNames = [
    "request-signature",
    "request_signature",
    "x-request-signature",
    "x-syncfy-signature",
    "x-paybook-signature"
  ];

  for (const headerName of supportedHeaderNames) {
    const signature = getHeaderString(headers[headerName]);
    if (signature) return { headerName, signature };
  }

  return { headerName: null, signature: undefined };
}

async function findFlowLedgerUserId(provider: string, providerUserId?: string) {
  if (!providerUserId) return undefined;

  const mapping = await prisma.userAuthAccount.findUnique({
    where: {
      provider_providerAccountId: {
        provider,
        providerAccountId: providerUserId
      }
    },
    select: { userId: true }
  });

  return mapping?.userId;
}

async function recordInvalidWebhook(input: {
  provider: string;
  rawBody: unknown;
  rawHeaders: Prisma.InputJsonValue;
  rawBodyText: string;
  eventName: string;
  errorMessage: string;
}) {
  return prisma.providerWebhookEvent.create({
    data: {
      provider: input.provider,
      providerEventId: `invalid:${randomUUID()}`,
      eventName: input.eventName,
      rawPayload: toJsonValue(input.rawBody),
      rawHeaders: input.rawHeaders,
      rawBody: input.rawBodyText,
      status: "failed",
      processedAt: new Date(),
      errorMessage: input.errorMessage.slice(0, 1000)
    }
  });
}

export function isPrismaUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

export function buildSyncfyWebhookEventRecordData(input: {
  providerEventId: string;
  userId?: string;
  rid?: string;
  event: SyncfyWebhookEvent;
  rawHeaders: Prisma.InputJsonValue;
  rawBody: string;
}) {
  return {
    userId: input.userId,
    provider: "syncfy",
    rid: input.rid,
    providerEventId: input.providerEventId,
    eventName: input.event.header.event.name ?? "unknown",
    providerUserId: input.event.header.user.id_user,
    providerExternalId: input.event.header.user.id_external,
    providerCredentialId: input.event.payload.id_credential,
    rawPayload: toJsonValue(input.event),
    rawHeaders: input.rawHeaders,
    rawBody: input.rawBody,
    status: "received",
    processedAt: null,
    errorMessage: null
  };
}

export async function recordSyncfyEventWithDependencies(input: {
  rid?: string;
  event: SyncfyWebhookEvent;
  rawHeaders: Prisma.InputJsonValue;
  rawBody: string;
  index: number;
  findFlowLedgerUserId: (
    provider: string,
    providerUserId?: string
  ) => Promise<string | undefined>;
  createProviderWebhookEvent: (
    data: ReturnType<typeof buildSyncfyWebhookEventRecordData>
  ) => Promise<{ id: string }>;
  findProviderWebhookEvent: (filters: {
    provider: string;
    providerEventId: string;
  }) => Promise<{ id: string } | null>;
}) {
  const provider = "syncfy";
  const providerEventId =
    input.event.header.event.eid ??
    generatedSyncfyEventEid(input.rid, input.event, input.index);
  const userId = await input.findFlowLedgerUserId(
    provider,
    input.event.header.user.id_user
  );
  const data = buildSyncfyWebhookEventRecordData({
    providerEventId,
    userId,
    rid: input.rid,
    event: input.event,
    rawHeaders: input.rawHeaders,
    rawBody: input.rawBody
  });

  try {
    const recordedEvent = await input.createProviderWebhookEvent(data);

    return { recordedEvent, shouldProcess: true };
  } catch (error) {
    if (isPrismaUniqueConstraintError(error)) {
      const recordedEvent = await input.findProviderWebhookEvent({
        provider,
        providerEventId
      });

      if (recordedEvent) return { recordedEvent, shouldProcess: false };
    }

    throw error;
  }
}

async function recordSyncfyEvent(input: {
  rid?: string;
  event: SyncfyWebhookEvent;
  rawHeaders: Prisma.InputJsonValue;
  rawBody: string;
  index: number;
}) {
  return recordSyncfyEventWithDependencies({
    ...input,
    findFlowLedgerUserId,
    createProviderWebhookEvent: (data) =>
      prisma.providerWebhookEvent.create({ data }),
    findProviderWebhookEvent: ({ provider, providerEventId }) =>
      prisma.providerWebhookEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider,
            providerEventId
          }
        }
      })
  });
}

function processRecordedEvent(input: {
  provider: ReturnType<typeof getProvider>;
  eventId: string;
  event: SyncfyWebhookEvent;
}) {
  if (!input.provider.handleWebhook) return;

  void input.provider
    .handleWebhook({ eventId: input.eventId, payload: input.event })
    .catch(() => undefined);
}

providerWebhooksRouter.post(
  "/:provider",
  validate(providerWebhookParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const providerParam = req.params.provider;
    if (!providerParam) {
      res.status(400).json({ message: "Provider is required" });
      return;
    }

    const providerKey = providerParam as ProviderKey;
    const provider = getProvider(providerKey);
    const rawHeaders = sanitizeWebhookHeaders(req.headers);
    const rawBody = rawBodyString(req.rawBody);

    if (providerKey !== "syncfy") {
      const eventId = `generic:${randomUUID()}`;
      const recordedEvent = await prisma.providerWebhookEvent.create({
        data: {
          provider: providerParam,
          providerEventId: eventId,
          eventName: "webhook",
          rawPayload: toJsonValue(req.body),
          rawHeaders,
          rawBody,
          status: "received"
        }
      });

      const result = provider.handleWebhook
        ? await provider.handleWebhook({
            eventId: recordedEvent.id,
            payload: req.body,
            headers: req.headers
          })
        : { status: "ignored" as const };

      res.status(200).json({
        success: true,
        acceptedEvents: 1,
        result
      });
      return;
    }

    const signatureHeader = findSyncfySignatureHeader(req.headers);
    const signatureVerification = verifySyncfyWebhookSignature({
      rawBody: req.rawBody,
      signature: signatureHeader.signature,
      signatureKey: env.SYNCFY_WEBHOOK_SIGNATURE_KEY
    });

    console.info("[PROVIDER WEBHOOK] Syncfy signature verification", {
      route: "/providers/webhooks/syncfy",
      result: signatureVerification,
      signatureHeaderNameFound: signatureHeader.headerName,
      diagnostics: getSyncfyWebhookSignatureDiagnostics({
        rawBody: req.rawBody,
        signature: signatureHeader.signature,
        signatureKey: env.SYNCFY_WEBHOOK_SIGNATURE_KEY
      }),
      contentType: getHeaderString(req.headers["content-type"]),
      hasContentEncoding: Boolean(getHeaderString(req.headers["content-encoding"]))
    });

    if (signatureVerification === "invalid") {
      await recordInvalidWebhook({
        provider: providerParam,
        rawBody: {
          redacted: true,
          reason: "invalid_signature",
          bodyBytes: req.rawBody?.length ?? 0,
          parsedJson: req.body !== undefined
        },
        rawHeaders,
        rawBodyText: "",
        eventName: "invalid_signature",
        errorMessage: "Syncfy webhook request-signature validation failed."
      }).catch(() => undefined);

      res.status(200).json({
        success: true,
        acceptedEvents: 0
      });
      console.warn("[PROVIDER WEBHOOK] Syncfy webhook rejected", {
        reason: "invalid_signature"
      });
      return;
    }

    const parsedWebhook = syncfyWebhookSchema.safeParse(req.body);

    if (!parsedWebhook.success) {
      await recordInvalidWebhook({
        provider: providerParam,
        rawBody: req.body,
        rawHeaders,
        rawBodyText: rawBody,
        eventName: "invalid",
        errorMessage: parsedWebhook.error.message
      }).catch(() => undefined);

      res.status(200).json({
        success: true,
        acceptedEvents: 0
      });
      console.warn("[PROVIDER WEBHOOK] Syncfy webhook rejected", {
        reason: "invalid_payload"
      });
      return;
    }

    const webhook = parsedWebhook.data;
    console.info("[PROVIDER WEBHOOK] Syncfy webhook received", {
      rid: webhook.rid,
      eventCount: webhook.events.length,
      events: webhook.events.map((event) => ({
        eventName: event.header.event.name ?? "unknown",
        providerCredentialId: event.payload.id_credential
      }))
    });
    const recordResults = await Promise.allSettled(
      webhook.events.map(async (event, index) => ({
        event,
        recordedEventResult: await recordSyncfyEvent({
          rid: webhook.rid,
          event,
          rawHeaders,
          rawBody,
          index
        })
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

      processRecordedEvent({
        provider,
        eventId: recordedEventResult.recordedEvent.id,
        event
      });
    });
  })
);

providerWebhooksRouter.get(
  "/:provider",
  validate(providerWebhookParamsSchema, "params"),
  asyncHandler(async (req, res) => {
    const providerParam = req.params.provider;
    if (!providerParam) {
      res.status(400).json({ message: "Provider is required" });
      return;
    }

    getProvider(providerParam as ProviderKey);

    res.status(200).json({
      success: true,
      provider: providerParam,
      message: "Provider webhook endpoint is alive. Use POST for events."
    });
  })
);
