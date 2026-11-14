import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthedUser } from "../../../tests/helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDatabase.js";

let app: Express;
let prisma: typeof import("../../../db/prisma.js").prisma;

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function mintKey(jwt: string, body: Record<string, unknown>) {
  const res = await request(app).post("/users/me/api-keys").set(bearer(jwt)).send({ name: "k", ...body });
  return res.body.key as string;
}

async function createUser() {
  const { token: jwt } = await createAuthedUser(app);
  const me = await request(app).get("/auth/me").set(bearer(jwt));
  const userId = (me.body.user?.id ?? me.body.id) as string;
  const model = await prisma.notificationModel.create({ data: { userId, name: "m", code: "", isActive: true } });
  return {
    userId,
    modelId: model.id,
    ingestKey: await mintKey(jwt, { ingestOnly: true }),
    writeKey: await mintKey(jwt, { allowWrite: true })
  };
}

describe("POST /v1/notification-models/:id/notifications", () => {
  let a: Awaited<ReturnType<typeof createUser>>;
  let b: Awaited<ReturnType<typeof createUser>>;
  const path = (id: string) => `/v1/notification-models/${id}/notifications`;

  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
    ({ prisma } = await import("../../../db/prisma.js"));
    a = await createUser();
    b = await createUser();
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it("accepts {text} with 202, persists a queued run and dedupes a repeat", async () => {
    const res = await request(app).post(path(a.modelId)).set(bearer(a.ingestKey)).send({ text: "Compraste $5.00" });
    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ status: "queued", duplicate: false });
    const run = await prisma.notificationRun.findUniqueOrThrow({ where: { id: res.body.runId } });
    expect(run).toMatchObject({ userId: a.userId, modelId: a.modelId, status: "queued", text: "Compraste $5.00" });

    const again = await request(app).post(path(a.modelId)).set(bearer(a.ingestKey)).send({ text: "Compraste $5.00" });
    expect(again.status).toBe(202);
    expect(again.body).toMatchObject({ runId: res.body.runId, duplicate: true });
  });

  it.each([
    ["empty", { text: "" }],
    ["oversized", { text: "x".repeat(4001) }],
    ["extra field", { text: "hi", title: "t" }]
  ])("rejects an %s body with 400", async (_name, body) => {
    expect((await request(app).post(path(a.modelId)).set(bearer(a.ingestKey)).send(body)).status).toBe(400);
  });

  it("returns 404 for another user's model", async () => {
    expect((await request(app).post(path(b.modelId)).set(bearer(a.ingestKey)).send({ text: "hi" })).status).toBe(404);
  });

  it("returns 503 and stores no run when the insert fails", async () => {
    const before = await prisma.notificationRun.count();
    const spy = vi.spyOn(prisma.notificationRun, "create").mockRejectedValueOnce(new Error("db down"));
    const res = await request(app).post(path(a.modelId)).set(bearer(a.ingestKey)).send({ text: "unique 503" });
    spy.mockRestore();
    expect(res.status).toBe(503);
    expect(await prisma.notificationRun.count()).toBe(before);
  });

  it("scopes: an ingest key cannot read, a write key cannot ingest", async () => {
    expect((await request(app).get("/v1/accounts").set(bearer(a.ingestKey))).status).toBe(403);
    expect((await request(app).post(path(a.modelId)).set(bearer(a.writeKey)).send({ text: "hi" })).status).toBe(403);
  });

  it("never writes the notification text to the request or audit logs", async () => {
    const secret = "SECRET-NOTIFICATION-TEXT-9917";
    const chunks: string[] = [];
    const capture = (chunk: unknown) => {
      chunks.push(String(chunk));
      return true;
    };
    const out = vi.spyOn(process.stdout, "write").mockImplementation(capture as never);
    const log = vi.spyOn(console, "log").mockImplementation(capture as never);
    const res = await request(app).post(path(a.modelId)).set(bearer(a.ingestKey)).send({ text: secret });
    await new Promise((r) => setTimeout(r, 50));
    out.mockRestore();
    log.mockRestore();
    expect(res.status).toBe(202);
    expect(chunks.join("")).not.toContain(secret);
  });
});
