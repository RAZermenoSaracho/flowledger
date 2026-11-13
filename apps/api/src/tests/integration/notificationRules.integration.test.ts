import { DEFAULT_NOTIFICATION_RULES, generateNotificationCode } from "@flowledger/shared";
import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { registerWithSession } from "../helpers/sessionCookies.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Needs Docker (see docs/TESTING.md). Real Pyodide sandbox: every run costs a ~3 s sandbox spawn.
vi.hoisted(() => {
  process.env.NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL = "2";
  process.env.NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER = "1";
});

let app: Express;
let prisma: typeof import("../../db/prisma.js").prisma;
let NotificationRunWorker: typeof import("../../modules/notificationModels/notificationRunWorker.js").NotificationRunWorker;

type User = { token: string; userId: string; key: string };

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TERMINAL = ["completed", "skipped", "failed"];
const DEFAULT_CODE = generateNotificationCode(DEFAULT_NOTIFICATION_RULES);

async function createUser(): Promise<User> {
  const session = await registerWithSession(app);
  await prisma.user.update({ where: { id: session.userId }, data: { preferredCurrency: "MXN" } });
  const keyRes = await request(app).post("/users/me/api-keys").set(bearer(session.token)).send({ name: "ingest", ingestOnly: true });
  expect(keyRes.status).toBe(201);
  return { token: session.token, userId: session.userId, key: keyRes.body.key };
}

async function createDefaultModel(user: User, code = DEFAULT_CODE) {
  const res = await request(app)
    .post("/notification-models")
    .set(bearer(user.token))
    .send({ name: "Rules model", code, slots: [], bindings: {}, isActive: true });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.model.id as string;
}

const playground = (user: User, id: string, text: string) =>
  request(app).post(`/notification-models/${id}/test`).set(bearer(user.token)).send({ text });
const parseRules = (user: User, code: string) =>
  request(app).post("/notification-models/parse-rules").set(bearer(user.token)).send({ code });

/** Ingests `text`, runs a worker until the run is terminal and returns the run. */
async function runThroughWorker(user: User, modelId: string, text: string) {
  const res = await request(app).post(`/v1/notification-models/${modelId}/notifications`).set(bearer(user.key)).send({ text });
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  const worker = new NotificationRunWorker();
  await worker.start();
  try {
    const deadline = Date.now() + 120_000;
    for (;;) {
      const run = await prisma.notificationRun.findUniqueOrThrow({ where: { id: res.body.runId } });
      if (TERMINAL.includes(run.status)) return run;
      if (Date.now() > deadline) throw new Error("run did not finish");
      await sleep(100);
    }
  } finally {
    await worker.stop();
  }
}

describe("notification visual rules (real sandbox)", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    ({ NotificationRunWorker } = await import("../../modules/notificationModels/notificationRunWorker.js"));
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it("default rules code: Playground and worker agree on a purchase and on a non-match", async () => {
    const user = await createUser();
    const modelId = await createDefaultModel(user);

    const hit = await playground(user, modelId, "Compra realizada por $150.00");
    expect(hit.status, JSON.stringify(hit.body)).toBe(200);
    expect(hit.body).toMatchObject({
      outcome: "proposal",
      proposal: { kind: "expense", amount: "150.00", name: "Compra realizada" },
      transactionPreview: { executionCurrency: "MXN" }
    });

    const miss = await playground(user, modelId, "Hola, ¿qué tal?");
    expect(miss.body).toMatchObject({ outcome: "skip", reason: "not a purchase" });

    const run = await runThroughWorker(user, modelId, "Compra realizada por $150.00");
    expect(run, JSON.stringify(run)).toMatchObject({ status: "completed", reason: null });
    const txs = await prisma.transaction.findMany({ where: { userId: user.userId } });
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      id: run.transactionId,
      type: "expense",
      name: "Compra realizada",
      accountId: null,
      categoryId: null,
      executionCurrency: "MXN"
    });
    expect(txs[0]!.amount.toString()).toBe("150");

    const skipped = await runThroughWorker(user, modelId, "Hola, ¿qué tal?");
    expect(skipped).toMatchObject({ status: "skipped", reason: "not a purchase", transactionId: null });
    expect(await prisma.transaction.count({ where: { userId: user.userId } })).toBe(1);
  }, 180_000);

  it("parse-rules returns the default rules, rejects a loop with its line, and never touches saved code", async () => {
    const user = await createUser();
    const modelId = await createDefaultModel(user);

    const ok = await parseRules(user, DEFAULT_CODE);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toEqual({ rules: DEFAULT_NOTIFICATION_RULES });

    const looped = `def process(text, ctx):\n    t = normalize(text)\n    for x in text:\n        pass\n    return skip("x")\n`;
    const bad = await parseRules(user, looped);
    expect(bad.status).toBe(200);
    expect(bad.body.rules).toBeUndefined();
    expect(bad.body.unsupported).toEqual([expect.objectContaining({ line: 3, message: expect.stringContaining("loop") })]);

    const saved = await request(app).get(`/notification-models/${modelId}`).set(bearer(user.token));
    expect(saved.body.model.code).toBe(DEFAULT_CODE);
  }, 120_000);

  it("library: install, publish v2 and update-from-source keep generated code parseable and bindings untouched", async () => {
    const author = await createUser();
    const consumer = await createUser();
    const sourceId = await createDefaultModel(author);
    const v1 = await request(app).post(`/notification-models/${sourceId}/publish`).set(bearer(author.token));
    expect(v1.status, JSON.stringify(v1.body)).toBe(200);

    const copy = (await request(app).post(`/notification-library/${sourceId}/install`).set(bearer(consumer.token))).body.model;
    expect(copy.code).toBe(DEFAULT_CODE);
    expect((await parseRules(consumer, copy.code)).body).toEqual({ rules: DEFAULT_NOTIFICATION_RULES });

    const renamed = {
      ...DEFAULT_NOTIFICATION_RULES,
      rules: [{ ...DEFAULT_NOTIFICATION_RULES.rules[0]!, action: { ...DEFAULT_NOTIFICATION_RULES.rules[0]!.action, name: { fixed: "Compra" } } }]
    } as typeof DEFAULT_NOTIFICATION_RULES;
    const v2Code = generateNotificationCode(renamed);
    expect(v2Code).not.toBe(DEFAULT_CODE);
    const put = await request(app).put(`/notification-models/${sourceId}`).set(bearer(author.token)).send({ code: v2Code });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const v2 = await request(app).post(`/notification-models/${sourceId}/publish`).set(bearer(author.token));
    expect(v2.status, JSON.stringify(v2.body)).toBe(200);

    const applied = await request(app)
      .post(`/notification-models/${copy.id}/update-from-source`)
      .set(bearer(consumer.token))
      .send({ versionId: v2.body.version.id });
    expect(applied.status, JSON.stringify(applied.body)).toBe(200);
    expect(applied.body.model).toMatchObject({ code: v2Code, bindings: {} });
    const row = await prisma.notificationModel.findUniqueOrThrow({ where: { id: copy.id } });
    expect(row.userId).toBe(consumer.userId);

    const reparsed = await parseRules(consumer, applied.body.model.code);
    expect(reparsed.body).toEqual({ rules: renamed });
  }, 180_000);
});
