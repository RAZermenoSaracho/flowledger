import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../utils/providerRegistry.js", () => ({
  getProvider: vi.fn()
}));

vi.mock("../../providers/syncfy/syncfy.webhookSecurity.js", () => ({
  verifySyncfyWebhookSignature: vi.fn(),
  getSyncfyWebhookSignatureDiagnostics: vi.fn().mockReturnValue({})
}));

const { getProvider } = await import("../../utils/providerRegistry.js");
const { verifySyncfyWebhookSignature } = await import(
  "../../providers/syncfy/syncfy.webhookSecurity.js"
);
const getProviderMock = vi.mocked(getProvider);
const verifySyncfyWebhookSignatureMock = vi.mocked(verifySyncfyWebhookSignature);

const {
  buildSyncfyWebhookEventRecordData,
  generatedSyncfyEventEid,
  getProviderWebhookHealth,
  handleProviderWebhook,
  isPrismaUniqueConstraintError,
  recordSyncfyEventWithDependencies,
  syncfyWebhookSchema
} = await import("../providerWebhooks.service.js");

const webhookPayload = {
  rid: "rid_1",
  events: [
    {
      header: {
        event: { eid: "evt_1", name: "credentials.updated" },
        user: { id_user: "syncfy_user_1", id_external: "flowledger_user_1" }
      },
      payload: {
        id_credential: "credential_1",
        endpoints: { accounts: "/accounts", transactions: ["/transactions"] }
      }
    }
  ]
};

beforeEach(() => {
  getProviderMock.mockReset();
  verifySyncfyWebhookSignatureMock.mockReset();
});

describe("syncfyWebhookSchema", () => {
  it("parses a valid webhook payload", () => {
    const parsed = syncfyWebhookSchema.parse(webhookPayload);
    expect(parsed.rid).toBe("rid_1");
    expect(parsed.events[0]?.header.event.eid).toBe("evt_1");
    expect(parsed.events[0]?.payload.id_credential).toBe("credential_1");
  });

  it("defaults events to an empty array when omitted", () => {
    expect(syncfyWebhookSchema.parse({}).events).toEqual([]);
  });
});

describe("generatedSyncfyEventEid", () => {
  const event = {
    header: { event: { name: "credentials.updated" }, user: { id_user: "u1" } },
    payload: { id_credential: "cred-1" }
  } as never;

  it("is deterministic for the same rid/event/index", () => {
    expect(generatedSyncfyEventEid("rid_1", event, 0)).toBe(
      generatedSyncfyEventEid("rid_1", event, 0)
    );
  });

  it("differs for a different index", () => {
    expect(generatedSyncfyEventEid("rid_1", event, 0)).not.toBe(
      generatedSyncfyEventEid("rid_1", event, 1)
    );
  });
});

describe("isPrismaUniqueConstraintError", () => {
  it("is true for a P2002 error", () => {
    expect(
      isPrismaUniqueConstraintError(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "test"
        })
      )
    ).toBe(true);
  });

  it("is false for a different Prisma error code", () => {
    expect(
      isPrismaUniqueConstraintError(
        new Prisma.PrismaClientKnownRequestError("missing", {
          code: "P2025",
          clientVersion: "test"
        })
      )
    ).toBe(false);
  });

  it("is false for a plain Error", () => {
    expect(isPrismaUniqueConstraintError(new Error("boom"))).toBe(false);
  });
});

describe("buildSyncfyWebhookEventRecordData", () => {
  it("builds a 'received' event row from the event payload", () => {
    const data = buildSyncfyWebhookEventRecordData({
      providerEventId: "evt_1",
      userId: "user-1",
      rid: "rid_1",
      event: webhookPayload.events[0] as never,
      rawHeaders: {},
      rawBody: "{}"
    });

    expect(data).toMatchObject({
      userId: "user-1",
      provider: "syncfy",
      providerEventId: "evt_1",
      eventName: "credentials.updated",
      providerUserId: "syncfy_user_1",
      providerCredentialId: "credential_1",
      status: "received",
      processedAt: null
    });
  });
});

describe("recordSyncfyEventWithDependencies", () => {
  const baseInput = {
    rid: "rid_1",
    event: webhookPayload.events[0] as never,
    rawHeaders: {},
    rawBody: "{}",
    index: 0
  };

  it("records a new event and reports shouldProcess: true", async () => {
    const result = await recordSyncfyEventWithDependencies({
      ...baseInput,
      findFlowLedgerUserId: async () => "flowledger_user_1",
      createProviderWebhookEvent: async () => ({ id: "row-1" }),
      findProviderWebhookEvent: async () => null
    });

    expect(result).toEqual({
      recordedEvent: { id: "row-1" },
      shouldProcess: true
    });
  });

  it("on a duplicate (P2002) insert, returns the existing row with shouldProcess: false", async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "test" }
    );

    const result = await recordSyncfyEventWithDependencies({
      ...baseInput,
      findFlowLedgerUserId: async () => "flowledger_user_1",
      createProviderWebhookEvent: async () => {
        throw duplicateError;
      },
      findProviderWebhookEvent: async ({ provider, providerEventId }) => ({
        id: `${provider}:${providerEventId}`
      })
    });

    expect(result.shouldProcess).toBe(false);
    expect(result.recordedEvent.id).toBe("syncfy:evt_1");
  });

  it("rethrows a non-duplicate error", async () => {
    await expect(
      recordSyncfyEventWithDependencies({
        ...baseInput,
        findFlowLedgerUserId: async () => undefined,
        createProviderWebhookEvent: async () => {
          throw new Error("db down");
        },
        findProviderWebhookEvent: async () => null
      })
    ).rejects.toThrow("db down");
  });

  it("rethrows the duplicate error if the existing row can't be found", async () => {
    const duplicateError = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test"
    });

    await expect(
      recordSyncfyEventWithDependencies({
        ...baseInput,
        findFlowLedgerUserId: async () => undefined,
        createProviderWebhookEvent: async () => {
          throw duplicateError;
        },
        findProviderWebhookEvent: async () => null
      })
    ).rejects.toBe(duplicateError);
  });

  it("falls back to a generated eid when the event has no eid", async () => {
    const eventWithoutEid = {
      header: {
        event: { name: "credentials.updated" },
        user: { id_user: "u1" }
      },
      payload: { id_credential: "cred-1" }
    } as never;

    const createProviderWebhookEvent = vi.fn().mockResolvedValue({ id: "row-1" });
    await recordSyncfyEventWithDependencies({
      ...baseInput,
      event: eventWithoutEid,
      findFlowLedgerUserId: async () => undefined,
      createProviderWebhookEvent,
      findProviderWebhookEvent: async () => null
    });

    const [dataArg] = createProviderWebhookEvent.mock.calls[0] as [
      { providerEventId: string }
    ];
    expect(dataArg.providerEventId).toBe(
      generatedSyncfyEventEid("rid_1", eventWithoutEid, 0)
    );
  });
});

describe("getProviderWebhookHealth", () => {
  it("returns an alive payload when the provider is registered", () => {
    getProviderMock.mockReturnValue({ key: "syncfy" } as never);
    expect(getProviderWebhookHealth("syncfy")).toMatchObject({
      success: true,
      provider: "syncfy"
    });
  });

  it("propagates the 404 from getProvider for an unregistered provider", () => {
    getProviderMock.mockImplementation(() => {
      throw new Error("Provider bogus is not configured");
    });
    expect(() => getProviderWebhookHealth("bogus")).toThrow(
      "Provider bogus is not configured"
    );
  });
});

describe("handleProviderWebhook — non-syncfy provider", () => {
  it("records a generic webhook event and forwards it to the provider's handleWebhook", async () => {
    const handleWebhook = vi.fn().mockResolvedValue({ status: "ok" });
    getProviderMock.mockReturnValue({ key: "other", handleWebhook } as never);
    prismaMock.providerWebhookEvent.create.mockResolvedValue({
      id: "row-1"
    } as never);

    const result = await handleProviderWebhook({
      providerParam: "other",
      headers: {},
      rawBody: Buffer.from("{}"),
      body: { some: "payload" }
    });

    expect(result).toEqual({ kind: "generic", result: { status: "ok" } });
    expect(handleWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ eventId: "row-1" })
    );
  });

  it("returns 'ignored' when the provider has no handleWebhook", async () => {
    getProviderMock.mockReturnValue({ key: "other" } as never);
    prismaMock.providerWebhookEvent.create.mockResolvedValue({
      id: "row-1"
    } as never);

    const result = await handleProviderWebhook({
      providerParam: "other",
      headers: {},
      rawBody: Buffer.from("{}"),
      body: {}
    });

    expect(result).toEqual({ kind: "generic", result: { status: "ignored" } });
  });
});

describe("handleProviderWebhook — syncfy provider", () => {
  it("rejects an invalid signature without recording the raw body", async () => {
    getProviderMock.mockReturnValue({ key: "syncfy" } as never);
    verifySyncfyWebhookSignatureMock.mockReturnValue("invalid");
    prismaMock.providerWebhookEvent.create.mockResolvedValue({} as never);

    const result = await handleProviderWebhook({
      providerParam: "syncfy",
      headers: {},
      rawBody: Buffer.from("{}"),
      body: webhookPayload
    });

    expect(result).toEqual({ kind: "invalid_signature" });
  });

  it("rejects a payload that fails schema validation", async () => {
    getProviderMock.mockReturnValue({ key: "syncfy" } as never);
    verifySyncfyWebhookSignatureMock.mockReturnValue("skipped");
    prismaMock.providerWebhookEvent.create.mockResolvedValue({} as never);

    const result = await handleProviderWebhook({
      providerParam: "syncfy",
      headers: {},
      rawBody: Buffer.from("not json"),
      body: { events: "not-an-array" }
    });

    expect(result).toEqual({ kind: "invalid_payload" });
  });

  it("records and dispatches every event in a valid payload", async () => {
    const handleWebhook = vi.fn().mockResolvedValue({ status: "processed" });
    getProviderMock.mockReturnValue({ key: "syncfy", handleWebhook } as never);
    verifySyncfyWebhookSignatureMock.mockReturnValue("valid");
    prismaMock.providerWebhookEvent.create.mockResolvedValue({
      id: "row-1"
    } as never);
    prismaMock.userAuthAccount.findUnique.mockResolvedValue(null);

    const result = await handleProviderWebhook({
      providerParam: "syncfy",
      headers: {},
      rawBody: Buffer.from(JSON.stringify(webhookPayload)),
      body: webhookPayload
    });

    expect(result).toMatchObject({
      kind: "processed",
      rid: "rid_1",
      signatureVerification: "valid",
      acceptedEvents: 1
    });
    expect(prismaMock.providerWebhookEvent.create).toHaveBeenCalledOnce();
  });

  it("redacts sensitive headers (including array values) while passing through others", async () => {
    getProviderMock.mockReturnValue({ key: "syncfy" } as never);
    verifySyncfyWebhookSignatureMock.mockReturnValue("invalid");
    prismaMock.providerWebhookEvent.create.mockResolvedValue({} as never);

    await handleProviderWebhook({
      providerParam: "syncfy",
      headers: {
        authorization: ["Bearer secret"],
        cookie: "session=abc",
        "content-type": "application/json"
      },
      rawBody: Buffer.from("{}"),
      body: webhookPayload
    });

    const [{ data }] = prismaMock.providerWebhookEvent.create.mock.calls[0] as [
      { data: { rawHeaders: Record<string, unknown> } }
    ];
    expect(data.rawHeaders).toMatchObject({
      authorization: { redacted: true, present: true, length: "Bearer secret".length },
      cookie: { redacted: true, present: true },
      "content-type": "application/json"
    });
  });

  it("redacts a sensitive header even when its value is absent", async () => {
    getProviderMock.mockReturnValue({ key: "syncfy" } as never);
    verifySyncfyWebhookSignatureMock.mockReturnValue("invalid");
    prismaMock.providerWebhookEvent.create.mockResolvedValue({} as never);

    await handleProviderWebhook({
      providerParam: "syncfy",
      headers: { authorization: undefined },
      rawBody: Buffer.from("{}"),
      body: webhookPayload
    });

    const [{ data }] = prismaMock.providerWebhookEvent.create.mock.calls[0] as [
      { data: { rawHeaders: Record<string, unknown> } }
    ];
    expect(data.rawHeaders).toMatchObject({
      authorization: { redacted: true, present: false, length: 0 }
    });
  });

  it("finds the signature under a fallback header name and unwraps an array value", async () => {
    getProviderMock.mockReturnValue({ key: "syncfy" } as never);
    verifySyncfyWebhookSignatureMock.mockReturnValue("valid");
    prismaMock.providerWebhookEvent.create.mockResolvedValue({ id: "row-1" } as never);
    prismaMock.userAuthAccount.findUnique.mockResolvedValue(null);

    await handleProviderWebhook({
      providerParam: "syncfy",
      headers: { "x-syncfy-signature": ["sig-value"] },
      rawBody: Buffer.from(JSON.stringify(webhookPayload)),
      body: webhookPayload
    });

    expect(verifySyncfyWebhookSignatureMock).toHaveBeenCalledWith(
      expect.objectContaining({ signature: "sig-value" })
    );
  });

  it("does not dispatch to the provider adapter when it has no handleWebhook", async () => {
    getProviderMock.mockReturnValue({ key: "syncfy" } as never);
    verifySyncfyWebhookSignatureMock.mockReturnValue("valid");
    prismaMock.providerWebhookEvent.create.mockResolvedValue({ id: "row-1" } as never);
    prismaMock.userAuthAccount.findUnique.mockResolvedValue(null);

    const result = await handleProviderWebhook({
      providerParam: "syncfy",
      headers: {},
      rawBody: Buffer.from(JSON.stringify(webhookPayload)),
      body: webhookPayload
    });

    expect(result).toMatchObject({ kind: "processed", acceptedEvents: 1 });
  });

  it("does not dispatch a duplicate event (shouldProcess: false)", async () => {
    const handleWebhook = vi.fn().mockResolvedValue({ status: "processed" });
    getProviderMock.mockReturnValue({ key: "syncfy", handleWebhook } as never);
    verifySyncfyWebhookSignatureMock.mockReturnValue("valid");
    const duplicateError = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test"
    });
    prismaMock.providerWebhookEvent.create.mockRejectedValue(duplicateError);
    prismaMock.providerWebhookEvent.findUnique.mockResolvedValue({
      id: "existing-row"
    } as never);
    prismaMock.userAuthAccount.findUnique.mockResolvedValue(null);

    const result = await handleProviderWebhook({
      providerParam: "syncfy",
      headers: {},
      rawBody: Buffer.from(JSON.stringify(webhookPayload)),
      body: webhookPayload
    });

    expect(result).toMatchObject({ kind: "processed", acceptedEvents: 1 });
    expect(handleWebhook).not.toHaveBeenCalled();
  });

  it("excludes an event from acceptedEvents when recording it rejects", async () => {
    getProviderMock.mockReturnValue({ key: "syncfy" } as never);
    verifySyncfyWebhookSignatureMock.mockReturnValue("valid");
    prismaMock.providerWebhookEvent.create.mockResolvedValue({ id: "row-1" } as never);
    prismaMock.userAuthAccount.findUnique.mockRejectedValue(new Error("db down"));

    const result = await handleProviderWebhook({
      providerParam: "syncfy",
      headers: {},
      rawBody: Buffer.from(JSON.stringify(webhookPayload)),
      body: webhookPayload
    });

    expect(result).toMatchObject({ kind: "processed", acceptedEvents: 0 });
  });
});
