import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../../../tests/helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../../../tests/helpers/testDatabase.js";

let app: Express;

const SCRIPT = `def process(text, ctx):
    return expense(amount="10.00", name="OXXO", account="card", category="general", currency="MXN")
`;
const slots = [
  { key: "card", kind: "account", label: "Card", required: true },
  { key: "general", kind: "category", label: "General", required: true }
];

type User = Awaited<ReturnType<typeof createAuthedUser>>;
const auth = (user: User) => ({ Authorization: `Bearer ${user.token}` });

async function createRecords(user: User) {
  const account = await request(app).post("/accounts").set(auth(user)).send({ name: "Plata", type: "checking", currency: "MXN" });
  const category = await request(app).post("/categories").set(auth(user)).send({ name: "Food", type: "expense" });
  return { accountId: account.body.account.id as string, categoryId: category.body.category.id as string };
}

async function createModel(user: User, body: Record<string, unknown> = {}) {
  const response = await request(app)
    .post("/notification-models")
    .set(auth(user))
    .send({ name: "Plata", code: SCRIPT, slots, ...body });
  return response;
}

describe("/notification-models routes", { timeout: 60_000 }, () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/notification-models")).status).toBe(401);
  });

  it("creates an inactive model, lists only the caller's, reads, updates and deletes it", async () => {
    const owner = await createAuthedUser(app);
    const other = await createAuthedUser(app);

    const created = await createModel(owner);
    expect(created.status).toBe(201);
    expect(created.body.model.isActive).toBe(false);
    const id = created.body.model.id as string;

    const list = await request(app).get("/notification-models").set(auth(owner));
    expect(list.body.data.map((m: { id: string }) => m.id)).toEqual([id]);
    expect((await request(app).get("/notification-models").set(auth(other))).body.data).toEqual([]);

    const read = await request(app).get(`/notification-models/${id}`).set(auth(owner));
    expect(read.body.model).toMatchObject({
      endpointPath: `/v1/notification-models/${id}/notifications`,
      queued: 0,
      processing: 0,
      update: { available: false }
    });

    const updated = await request(app).put(`/notification-models/${id}`).set(auth(owner)).send({ name: "Renamed" });
    expect(updated.body.model.name).toBe("Renamed");

    expect((await request(app).delete(`/notification-models/${id}`).set(auth(owner))).status).toBe(204);
    expect((await request(app).get(`/notification-models/${id}`).set(auth(owner))).status).toBe(404);
  });

  it("answers another user's model with the same 404 as a missing one", async () => {
    const owner = await createAuthedUser(app);
    const other = await createAuthedUser(app);
    const id = (await createModel(owner)).body.model.id as string;
    const missing = await request(app).get("/notification-models/nope").set(auth(other));

    for (const call of [
      request(app).get(`/notification-models/${id}`),
      request(app).put(`/notification-models/${id}`).send({ name: "x" }),
      request(app).delete(`/notification-models/${id}`),
      request(app).post(`/notification-models/${id}/test`).send({ text: "t" }),
      request(app).get(`/notification-models/${id}/queue`),
      request(app).get(`/notification-models/${id}/logs`)
    ]) {
      const response = await call.set(auth(other));
      expect(response.status).toBe(404);
      expect(response.body).toEqual(missing.body);
    }
    expect((await request(app).get(`/notification-models/${id}`).set(auth(owner))).status).toBe(200);
  });

  it("rejects invalid code with line errors on save and through validate", async () => {
    const user = await createAuthedUser(app);
    const bad = await createModel(user, { code: "import os\n" });
    expect(bad.status).toBe(400);

    const validated = await request(app).post("/notification-models/validate").set(auth(user)).send({ code: "import os\n" });
    expect(validated.body.errors[0]).toMatchObject({ line: 1 });
    expect((await request(app).post("/notification-models/validate").set(auth(user)).send({ code: SCRIPT })).body.errors).toEqual([]);
  });

  it("rejects binding another user's record and activation with unbound required slots", async () => {
    const owner = await createAuthedUser(app);
    const other = await createAuthedUser(app);
    const mine = await createRecords(owner);
    const theirs = await createRecords(other);

    expect((await createModel(owner, { bindings: { card: theirs.accountId } })).status).toBe(400);

    const id = (await createModel(owner, { bindings: { card: mine.accountId } })).body.model.id as string;
    const activate = await request(app).put(`/notification-models/${id}`).set(auth(owner)).send({ isActive: true });
    expect(activate.status).toBe(400);
    expect(JSON.stringify(activate.body)).toContain("general");
    expect((await request(app).get(`/notification-models/${id}`).set(auth(owner))).body.model.isActive).toBe(false);

    const bound = await request(app)
      .put(`/notification-models/${id}`)
      .set(auth(owner))
      .send({ bindings: { card: mine.accountId, general: mine.categoryId }, isActive: true });
    expect(bound.status).toBe(200);
    expect(bound.body.model.isActive).toBe(true);

    const unbind = await request(app).put(`/notification-models/${id}`).set(auth(owner)).send({ bindings: { card: mine.accountId } });
    expect(unbind.status).toBe(400);
  });

  it("tests draft code with a preview and without creating transactions or runs", async () => {
    const user = await createAuthedUser(app);
    const records = await createRecords(user);
    const id = (
      await createModel(user, { bindings: { card: records.accountId, general: records.categoryId } })
    ).body.model.id as string;

    const result = await request(app)
      .post(`/notification-models/${id}/test`)
      .set(auth(user))
      .send({ text: "Compraste $10.00 MXN en OXXO" });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      outcome: "proposal",
      transactionPreview: { name: "OXXO", amount: "10.00", type: "expense", account: "Plata", category: "Food" }
    });

    const skipDraft = await request(app)
      .post(`/notification-models/${id}/test`)
      .set(auth(user))
      .send({ text: "x", code: 'def process(text, ctx):\n    return skip("draft")\n' });
    expect(skipDraft.body).toMatchObject({ outcome: "skip", reason: "draft" });

    const transactions = await request(app).get("/transactions").set(auth(user));
    expect(transactions.body.data).toEqual([]);
    const logs = await request(app).get(`/notification-models/${id}/logs`).set(auth(user));
    const queue = await request(app).get(`/notification-models/${id}/queue`).set(auth(user));
    expect(logs.body.data).toEqual([]);
    expect(queue.body.data).toEqual([]);
  });

  it("lists queue (oldest first, text cut to 80) and logs (newest first, purged text null)", async () => {
    const { prisma } = await import("../../../db/prisma.js");
    const user = await createAuthedUser(app);
    const id = (await createModel(user)).body.model.id as string;
    const base = { modelId: id, userId: user.user.id };
    await prisma.notificationRun.createMany({
      data: [
        { ...base, dedupeKey: "q2", status: "queued", text: "y".repeat(200), receivedAt: new Date("2026-01-02") },
        { ...base, dedupeKey: "q1", status: "processing", text: "first", receivedAt: new Date("2026-01-01") },
        { ...base, dedupeKey: "d1", status: "completed", text: "kept", finishedAt: new Date("2026-01-03") },
        { ...base, dedupeKey: "d2", status: "failed", text: null, finishedAt: new Date("2026-01-04") }
      ]
    });

    const queue = await request(app).get(`/notification-models/${id}/queue`).set(auth(user));
    expect(queue.body.data.map((r: { text: string }) => r.text)).toEqual(["first", "y".repeat(80)]);

    const logs = await request(app).get(`/notification-models/${id}/logs`).set(auth(user));
    expect(logs.body.data.map((r: { status: string; text: string | null }) => [r.status, r.text])).toEqual([
      ["failed", null],
      ["completed", "kept"]
    ]);

    const read = await request(app).get(`/notification-models/${id}`).set(auth(user));
    expect(read.body.model).toMatchObject({ queued: 1, processing: 1 });
  });

  it("GET /health/notification-worker answers 503 with no live worker and 200 once one has been seen", async () => {
    const { prisma } = await import("../../../db/prisma.js");
    await prisma.notificationWorker.deleteMany();
    const down = await request(app).get("/health/notification-worker");
    expect(down.status).toBe(503);
    expect(down.body).toEqual({ workers: 0 });

    await prisma.notificationWorker.create({ data: { id: "w-health", hostname: "h", pid: 1 } });
    const up = await request(app).get("/health/notification-worker");
    expect(up.status).toBe(200);
    expect(up.body).toEqual({ workers: 1 });
    await prisma.notificationWorker.deleteMany();
  });

  it("runs the library flow: publish, install, update available, apply with a new binding, foreign 404s", async () => {
    const author = await createAuthedUser(app);
    const installer = await createAuthedUser(app);
    const authorRecords = await createRecords(author);
    const mine = await createRecords(installer);

    const sourceId = (await createModel(author, { bindings: { card: authorRecords.accountId, general: authorRecords.categoryId } })).body.model.id as string;
    expect((await request(app).post(`/notification-models/${sourceId}/publish`).set(auth(installer))).status).toBe(404);
    const published = await request(app).post(`/notification-models/${sourceId}/publish`).set(auth(author));
    expect(published.body.version.version).toBe(1);
    expect(published.body.model.visibility).toBe("public");
    expect(JSON.stringify(published.body.version)).not.toContain(authorRecords.accountId);

    const list = await request(app).get("/notification-library").set(auth(installer));
    expect(list.body.data[0]).toMatchObject({ modelId: sourceId, version: 1, author: { username: author.user.username } });
    expect(JSON.stringify(list.body)).not.toMatch(/email|bindings/);
    expect((await request(app).get(`/notification-library/${sourceId}`).set(auth(installer))).body.entry.code).toBe(SCRIPT);

    const copy = (await request(app).post(`/notification-library/${sourceId}/install`).set(auth(installer))).body.model;
    expect(copy).toMatchObject({ isActive: false, visibility: "private", bindings: {} });
    expect(copy.id).not.toBe(sourceId);
    const bound = await request(app)
      .put(`/notification-models/${copy.id}`)
      .set(auth(installer))
      .send({ bindings: { card: mine.accountId, general: mine.categoryId }, isActive: true });
    expect(bound.status).toBe(200);

    const v2Code = SCRIPT.replace("OXXO", "SORIANA");
    const newSlots = [...slots, { key: "extra", kind: "account", label: "Extra", required: true }];
    await request(app).put(`/notification-models/${sourceId}`).set(auth(author)).send({ code: v2Code, slots: newSlots, bindings: { card: authorRecords.accountId, general: authorRecords.categoryId, extra: authorRecords.accountId } });
    const v2 = await request(app).post(`/notification-models/${sourceId}/publish`).set(auth(author));
    expect(v2.body.version.version).toBe(2);

    const info = await request(app).get(`/notification-models/${copy.id}`).set(auth(installer));
    expect(info.body.model.update).toMatchObject({ available: true, installedVersion: 1, latestVersion: 2, localCodeModified: false });

    const versionId = v2.body.version.id as string;
    const missing = await request(app).post(`/notification-models/${copy.id}/update-from-source`).set(auth(installer)).send({ versionId });
    expect(missing.status).toBe(400);
    expect(JSON.stringify(missing.body)).toContain("extra");
    expect((await request(app).post(`/notification-models/${copy.id}/update-from-source`).set(auth(author)).send({ versionId })).status).toBe(404);

    const applied = await request(app)
      .post(`/notification-models/${copy.id}/update-from-source`)
      .set(auth(installer))
      .send({ versionId, bindings: { extra: mine.accountId } });
    expect(applied.status).toBe(200);
    expect(applied.body.model).toMatchObject({ code: v2Code, isActive: true, bindings: { card: mine.accountId, extra: mine.accountId } });

    await request(app).delete(`/notification-models/${sourceId}`).set(auth(author));
    const after = await request(app).get(`/notification-models/${copy.id}`).set(auth(installer));
    expect(after.body.model).toMatchObject({ isActive: true, sourceVersionId: null, update: { available: false } });
  });
});
