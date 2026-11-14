import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { HttpError } from "../../../../utils/httpError.js";
import { ingestNotification } from "../ingest.service.js";

const now = new Date("2026-11-13T18:04:11.000Z");
const bucket = Math.floor(now.getTime() / 600_000);
const p2002 = () => new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" });

function ready(queued = 0) {
  prismaMock.notificationModel.findFirst.mockResolvedValue({ id: "m1" } as never);
  prismaMock.notificationRun.count.mockResolvedValue(queued);
  prismaMock.notificationRun.create.mockResolvedValue({ id: "r1", status: "queued" } as never);
}

describe("ingestNotification", () => {
  it("scopes the model lookup to the owner and active models, and inserts a queued run", async () => {
    ready();
    await expect(ingestNotification("u1", "m1", "hi", undefined, now)).resolves.toEqual({ runId: "r1", status: "queued", duplicate: false });
    expect(prismaMock.notificationModel.findFirst.mock.calls[0]![0]!.where).toEqual({ id: "m1", userId: "u1", isActive: true });
    expect(prismaMock.notificationRun.create.mock.calls[0]![0]!.data).toMatchObject({ modelId: "m1", userId: "u1", text: "hi" });
  });

  it("derives the dedupe key from sha256(text) and the 10-minute bucket", async () => {
    ready();
    await ingestNotification("u1", "m1", "hi", undefined, now);
    const expected = `${createHash("sha256").update("hi").digest("hex")}:${bucket}`;
    expect(prismaMock.notificationRun.create.mock.calls[0]![0]!.data.dedupeKey).toBe(expected);
  });

  it("uses the Idempotency-Key verbatim when given", async () => {
    ready();
    await ingestNotification("u1", "m1", "hi", "abc", now);
    expect(prismaMock.notificationRun.create.mock.calls[0]![0]!.data.dedupeKey).toBe("abc");
  });

  it("returns the existing run with duplicate:true on P2002", async () => {
    ready();
    prismaMock.notificationRun.create.mockRejectedValue(p2002());
    prismaMock.notificationRun.findUniqueOrThrow.mockResolvedValue({ id: "r0", status: "completed" } as never);
    await expect(ingestNotification("u1", "m1", "hi", "abc", now)).resolves.toEqual({ runId: "r0", status: "completed", duplicate: true });
    expect(prismaMock.notificationRun.findUniqueOrThrow.mock.calls[0]![0]!.where).toEqual({ modelId_dedupeKey: { modelId: "m1", dedupeKey: "abc" } });
  });

  it("404s for a missing, foreign or inactive model without inserting", async () => {
    prismaMock.notificationModel.findFirst.mockResolvedValue(null);
    await expect(ingestNotification("u1", "m1", "hi")).rejects.toMatchObject({ statusCode: 404 });
    expect(prismaMock.notificationRun.create).not.toHaveBeenCalled();
  });

  it("accepts at 499 queued and rejects with 429 at 500", async () => {
    ready(499);
    await expect(ingestNotification("u1", "m1", "hi")).resolves.toMatchObject({ duplicate: false });
    ready(500);
    await expect(ingestNotification("u1", "m1", "hi")).rejects.toMatchObject({ statusCode: 429 });
  });

  it("maps any other DB failure to 503", async () => {
    ready();
    prismaMock.notificationRun.create.mockRejectedValue(new Error("connection lost"));
    const error = await ingestNotification("u1", "m1", "hi").catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.statusCode).toBe(503);
  });
});
