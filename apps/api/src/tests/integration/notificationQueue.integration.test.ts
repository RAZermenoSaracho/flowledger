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
let failLostRuns: typeof import("../../modules/notificationModels/services/maintenance.service.js").failLostRuns;

type Worker = InstanceType<typeof NotificationRunWorker>;
type Owner = { token: string; userId: string; accountId: string; key: string };

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const TERMINAL = ["completed", "skipped", "failed"];

const SCRIPT = `
def process(text, ctx):
    if "promo" in normalize(text):
        return skip("promotion")
    m = re.search(r"pay (\\$[\\d,.]+) at (.+)", text, re.I)
    return expense(amount=amount(m.group(1)), name=m.group(2).strip(), account="card", currency="USD")
`;

async function createOwner(): Promise<Owner> {
  const session = await registerWithSession(app);
  const accountRes = await request(app).post("/accounts").set(bearer(session.token)).send({ name: "Card", type: "checking" });
  expect(accountRes.status).toBe(201);
  const keyRes = await request(app).post("/users/me/api-keys").set(bearer(session.token)).send({ name: "ingest", ingestOnly: true });
  expect(keyRes.status).toBe(201);
  return { token: session.token, userId: session.userId, accountId: accountRes.body.account.id, key: keyRes.body.key };
}

async function createModel(owner: Owner, over: { bindings?: object; isActive?: boolean } = {}) {
  const res = await request(app)
    .post("/notification-models")
    .set(bearer(owner.token))
    .send({
      name: "Card model",
      code: SCRIPT,
      slots: [{ key: "card", kind: "account", label: "Card", required: true }],
      bindings: over.bindings ?? { card: owner.accountId },
      isActive: over.isActive ?? Object.keys(over.bindings ?? { card: 1 }).length > 0
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.model.id as string;
}

function ingest(owner: Owner, modelId: string, text: string, idempotencyKey?: string) {
  const req = request(app).post(`/v1/notification-models/${modelId}/notifications`).set(bearer(owner.key));
  if (idempotencyKey) req.set("Idempotency-Key", idempotencyKey);
  return req.send({ text });
}

async function ingestOk(owner: Owner, modelId: string, text: string) {
  const res = await ingest(owner, modelId, text);
  expect(res.status, JSON.stringify(res.body)).toBe(202);
  return res.body as { runId: string; status: string; duplicate: boolean };
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number, onTick?: () => Promise<void>) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    await onTick?.();
    if (await check()) return;
    if (Date.now() > deadline) throw new Error("waitFor timed out");
    await sleep(100);
  }
}

const allTerminal = (modelIds: string[]) => async () =>
  (await prisma.notificationRun.count({ where: { modelId: { in: modelIds }, status: { notIn: TERMINAL as never } } })) === 0;

/** Starts `count` workers, runs until every run of `modelIds` is terminal, then stops them. */
async function drain(modelIds: string[], count = 1, onTick?: () => Promise<void>) {
  const workers: Worker[] = [];
  for (let i = 0; i < count; i++) {
    const w = new NotificationRunWorker();
    await w.start();
    workers.push(w);
  }
  try {
    await waitFor(allTerminal(modelIds), 9 * 60_000, onTick);
  } finally {
    await Promise.all(workers.map((w) => w.stop()));
  }
}

describe("notification queue (real sandbox)", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    ({ NotificationRunWorker } = await import("../../modules/notificationModels/notificationRunWorker.js"));
    ({ failLostRuns } = await import("../../modules/notificationModels/services/maintenance.service.js"));
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it("ingest creates exactly one transaction with the exact amount and bound account; duplicates, promotions, missing mappings and inactive models are handled", async () => {
    const owner = await createOwner();
    const modelId = await createModel(owner);
    const unboundModelId = await createModel(owner, { bindings: {} });
    await prisma.notificationModel.update({ where: { id: unboundModelId }, data: { isActive: true } });
    const inactiveModelId = await createModel(owner);

    const first = await ingestOk(owner, modelId, "pay $1,234.56 at Cafe Uno");
    expect(first).toMatchObject({ status: "queued", duplicate: false });
    const dupRes = await ingest(owner, modelId, "pay $1,234.56 at Cafe Uno");
    expect(dupRes.status).toBe(202);
    expect(dupRes.body).toMatchObject({ runId: first.runId, duplicate: true });
    const promo = await ingestOk(owner, modelId, "promo: pay $9.99 at Spam");
    const unbound = await ingestOk(owner, unboundModelId, "pay $5.00 at Nowhere");
    const inactive = await ingestOk(owner, inactiveModelId, "pay $7.00 at Ghost");
    await prisma.notificationModel.update({ where: { id: inactiveModelId }, data: { isActive: false } });

    await drain([modelId, unboundModelId, inactiveModelId]);

    const run = (id: string) => prisma.notificationRun.findUniqueOrThrow({ where: { id } });
    const done = await run(first.runId);
    expect(done).toMatchObject({ status: "completed", reason: null });
    const tx = await prisma.transaction.findUniqueOrThrow({ where: { id: done.transactionId! } });
    expect(tx).toMatchObject({ userId: owner.userId, accountId: owner.accountId, name: "Cafe Uno" });
    expect(tx.amount.toString()).toBe("1234.56");
    expect(await prisma.transaction.count({ where: { userId: owner.userId } })).toBe(1);

    expect(await run(promo.runId)).toMatchObject({ status: "skipped", reason: "promotion", transactionId: null });
    expect(await run(unbound.runId)).toMatchObject({ status: "failed", reason: "mapping_missing:card", transactionId: null });
    expect(await run(inactive.runId)).toMatchObject({ status: "skipped", reason: "model_inactive", transactionId: null });
  }, 120_000);

  it("saturation: 20 + 2 accepted; never more than 2 processing overall or 1 per user; B finishes before A's backlog drains", async () => {
    const a = await createOwner();
    const b = await createOwner();
    const modelA = await createModel(a);
    const modelB = await createModel(b);

    for (let i = 0; i < 20; i++) await ingestOk(a, modelA, `pay $${i + 1}.00 at A-${i}`);
    for (let i = 0; i < 2; i++) await ingestOk(b, modelB, `pay $${i + 1}.00 at B-${i}`);

    let samples = 0;
    let maxTotal = 0;
    let maxPerUser = 0;
    await drain([modelA, modelB], 2, async () => {
      const rows = await prisma.notificationRun.groupBy({
        by: ["userId"],
        where: { status: "processing", modelId: { in: [modelA, modelB] } },
        _count: { _all: true }
      });
      samples++;
      maxTotal = Math.max(maxTotal, rows.reduce((sum, r) => sum + r._count._all, 0));
      maxPerUser = Math.max(maxPerUser, ...rows.map((r) => r._count._all));
      expect(maxTotal, JSON.stringify(rows)).toBeLessThanOrEqual(2);
      expect(maxPerUser).toBeLessThanOrEqual(1);
    });
    expect(samples).toBeGreaterThan(10);

    const runs = await prisma.notificationRun.findMany({ where: { modelId: { in: [modelA, modelB] } } });
    expect(runs).toHaveLength(22);
    expect(runs.every((r) => r.status === "completed")).toBe(true);

    const finished = (userId: string) => runs.filter((r) => r.userId === userId).map((r) => r.finishedAt!.getTime());
    const aFinishes = finished(a.userId);
    expect(Math.max(...finished(b.userId))).toBeLessThan(Math.max(...aFinishes));
    expect(aFinishes.filter((t) => t > Math.max(...finished(b.userId))).length).toBeGreaterThan(0);

    const completed = runs.filter((r) => r.status === "completed");
    const txIds = completed.map((r) => r.transactionId);
    expect(new Set(txIds).size).toBe(completed.length);
    expect(await prisma.transaction.count({ where: { userId: { in: [a.userId, b.userId] } } })).toBe(completed.length);
  }, 600_000);

  it("FIFO: one model's runs start in receivedAt order", async () => {
    const owner = await createOwner();
    const modelId = await createModel(owner);
    for (let i = 0; i < 4; i++) await ingestOk(owner, modelId, `pay $${i + 1}.00 at Fifo-${i}`);

    await drain([modelId]);

    const runs = await prisma.notificationRun.findMany({ where: { modelId }, orderBy: { receivedAt: "asc" } });
    const starts = runs.map((r) => r.startedAt!.getTime());
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
    expect(new Set(starts).size).toBe(4);
  }, 120_000);

  it("persistence: stopping workers with runs queued loses nothing; a new worker processes every run", async () => {
    const owner = await createOwner();
    const modelId = await createModel(owner);
    for (let i = 0; i < 3; i++) await ingestOk(owner, modelId, `pay $${i + 1}.00 at Persist-${i}`);

    const w1 = new NotificationRunWorker();
    await w1.start();
    await waitFor(async () => (await prisma.notificationRun.count({ where: { modelId, status: "processing" } })) > 0, 30_000);
    await w1.stop();

    const afterStop = await prisma.notificationRun.findMany({ where: { modelId } });
    expect(afterStop.filter((r) => r.status === "processing")).toHaveLength(0);
    expect(afterStop.filter((r) => r.status === "queued").length).toBeGreaterThan(0);

    await drain([modelId]);

    const runs = await prisma.notificationRun.findMany({ where: { modelId } });
    expect(runs.every((r) => r.status === "completed")).toBe(true);
    expect(await prisma.transaction.count({ where: { userId: owner.userId } })).toBe(3);
  }, 180_000);

  it("crash: a processing run of a stale worker becomes failed/worker_lost, with no transaction, and is never executed", async () => {
    const owner = await createOwner();
    const modelId = await createModel(owner);
    const deadWorker = "dead-worker";
    await prisma.notificationWorker.create({
      data: { id: deadWorker, hostname: "ghost", pid: 1, lastSeenAt: new Date(Date.now() - 10 * 60_000) }
    });
    const lost = await prisma.notificationRun.create({
      data: {
        modelId, userId: owner.userId, text: "pay $3.00 at Lost", dedupeKey: "lost", status: "processing",
        workerId: deadWorker, startedAt: new Date(Date.now() - 10 * 60_000)
      }
    });

    expect(await failLostRuns()).toBe(1);
    expect(await prisma.notificationRun.findUniqueOrThrow({ where: { id: lost.id } })).toMatchObject({
      status: "failed", reason: "worker_lost", transactionId: null
    });

    const w = new NotificationRunWorker();
    await w.start();
    await sleep(5_000);
    await w.stop();

    expect(await prisma.notificationRun.findUniqueOrThrow({ where: { id: lost.id } })).toMatchObject({
      status: "failed", reason: "worker_lost", transactionId: null
    });
    expect(await prisma.transaction.count({ where: { userId: owner.userId } })).toBe(0);
  }, 60_000);

  it("capacity: with 500 queued runs the next POST is 429", async () => {
    const owner = await createOwner();
    const modelId = await createModel(owner);
    await prisma.notificationRun.createMany({
      data: Array.from({ length: 500 }, (_, i) => ({ modelId, userId: owner.userId, text: `queued ${i}`, dedupeKey: `seed-${i}` }))
    });

    const res = await ingest(owner, modelId, "pay $1.00 at Overflow");
    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBe("60");
    expect(await prisma.notificationRun.count({ where: { userId: owner.userId } })).toBe(500);
  }, 60_000);

  it("resolves currency: user currency without account, bound account's currency, explicit currency overrides the user's", async () => {
    const script = (call: string) => `
def process(text, ctx):
    m = re.search(r"pay (\\$[\\d,.]+) at (.+)", text, re.I)
    return ${call}
`;
    const createScripted = async (owner: Owner, call: string, bound: boolean) => {
      const res = await request(app)
        .post("/notification-models")
        .set(bearer(owner.token))
        .send({
          name: "Currency model",
          code: script(call),
          slots: bound ? [{ key: "card", kind: "account", label: "Card", required: true }] : [],
          bindings: bound ? { card: owner.accountId } : {},
          isActive: true
        });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      return res.body.model.id as string;
    };
    const minimal = 'expense(amount=amount(m.group(1)), name=m.group(2).strip())';

    const userOwner = await createOwner();
    await prisma.user.update({ where: { id: userOwner.userId }, data: { preferredCurrency: "MXN" } });
    const userModel = await createScripted(userOwner, minimal, false);

    const accountOwner = await createOwner();
    await prisma.user.update({ where: { id: accountOwner.userId }, data: { preferredCurrency: null } });
    await prisma.account.update({ where: { id: accountOwner.accountId }, data: { currency: "EUR" } });
    const accountModel = await createScripted(accountOwner, 'expense(amount=amount(m.group(1)), name=m.group(2).strip(), account="card")', true);
    const overrideModel = await createScripted(
      accountOwner,
      'expense(amount=amount(m.group(1)), name=m.group(2).strip(), currency="GBP")',
      false
    );

    const a = await ingestOk(userOwner, userModel, "pay $1,234.50 at Cafe Uno");
    const b = await ingestOk(accountOwner, accountModel, "pay $20.10 at Cafe Dos");
    const c = await ingestOk(accountOwner, overrideModel, "pay $300.00 at Cafe Tres");
    await drain([userModel, accountModel, overrideModel]);

    const created = async (runId: string) => {
      const run = await prisma.notificationRun.findUniqueOrThrow({ where: { id: runId } });
      expect(run, JSON.stringify(run)).toMatchObject({ status: "completed", reason: null });
      return prisma.transaction.findUniqueOrThrow({ where: { id: run.transactionId! } });
    };
    const [ta, tb, tc] = [await created(a.runId), await created(b.runId), await created(c.runId)];
    expect(ta).toMatchObject({ executionCurrency: "MXN", accountId: null });
    expect(ta.amount.toString()).toBe("1234.5");
    expect(tb).toMatchObject({ executionCurrency: "EUR", accountId: accountOwner.accountId });
    expect(tb.amount.toString()).toBe("20.1");
    expect(tc).toMatchObject({ executionCurrency: "GBP", accountId: null });

    const mismatchModel = await createScripted(
      accountOwner,
      'expense(amount=amount(m.group(1)), name=m.group(2).strip(), account="card", currency="GBP")',
      true
    );
    const d = await ingestOk(accountOwner, mismatchModel, "pay $5.00 at Cafe Cuatro");
    await drain([mismatchModel]);
    expect(await prisma.notificationRun.findUniqueOrThrow({ where: { id: d.runId } })).toMatchObject({
      status: "failed",
      reason: "accountAmount is required when GBP differs from EUR"
    });
    expect(tc.amount.toString()).toBe("300");
  }, 120_000);
});
