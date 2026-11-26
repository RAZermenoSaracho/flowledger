import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test (needs Docker, see CLAUDE.local.md): atomic batch import of provider-imported
// transactions against a testcontainers Postgres.
let app: Express;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function createActor() {
  const { token, user } = await createAuthedUser(app);
  const category = await request(app).post("/categories").set(bearer(token)).send({ name: "Food", type: "expense" });
  return { token, userId: user.id, categoryId: category.body.category.id as string };
}
type Actor = Awaited<ReturnType<typeof createActor>>;

async function seedPending(actor: Actor, count: number) {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `${actor.userId}-row-${i}`,
    userId: actor.userId,
    provider: "test",
    providerCredentialId: "cred",
    providerAccountId: "acc",
    providerTransactionId: `${actor.userId}-${i}`,
    description: `Import ${i}`,
    amount: -5,
    currency: "USD",
    transactionDate: new Date("2024-01-15"),
    categoryId: actor.categoryId,
    rawData: {}
  }));
  await prisma.providerImportedTransaction.createMany({ data: rows });
  return rows.map((row) => row.id);
}

const batchImport = (actor: Actor, selection: unknown) =>
  request(app).post("/transactions/imported/batch-import").set(bearer(actor.token)).send({ selection });

const countTransactions = (actor: Actor) => prisma.transaction.count({ where: { userId: actor.userId } });
const countPending = (actor: Actor) =>
  prisma.providerImportedTransaction.count({ where: { userId: actor.userId, status: "pending" } });

describe("atomic batch import", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
  }, 180_000);
  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  }, 60_000);

  it("answers an unknown id and another user's id with the identical 400 and imports nothing", async () => {
    const a = await createActor();
    const b = await createActor();
    const [mine] = await seedPending(a, 1);
    const [theirs] = await seedPending(b, 1);

    const res = await batchImport(a, { mode: "ids", ids: [mine, "does-not-exist", theirs] });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([
      { id: "does-not-exist", message: "Imported transaction not found" },
      { id: theirs, message: "Imported transaction not found" }
    ]);
    expect(await countTransactions(a)).toBe(0);
    expect(await countPending(a)).toBe(1);
    expect(await countPending(b)).toBe(1);
  });

  it("rejects an already-processed row with a 400 and imports nothing", async () => {
    const a = await createActor();
    const [first, second] = await seedPending(a, 2);
    await prisma.providerImportedTransaction.update({ where: { id: second }, data: { status: "ignored" } });

    const res = await batchImport(a, { mode: "ids", ids: [first, second] });

    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ id: second, message: "Only pending imported transactions can be imported" }]);
    expect(await countTransactions(a)).toBe(0);
  });

  it("imports a batch at the 500-row cap atomically within the transaction timeout", async () => {
    const a = await createActor();
    await seedPending(a, 500);

    const started = Date.now();
    const res = await batchImport(a, { mode: "filtered" });
    const elapsedMs = Date.now() - started;
    console.info(`batch import of 500 rows took ${elapsedMs} ms`);

    expect(res.status, `${elapsedMs} ms: ${JSON.stringify(res.body)}`).toBe(201);
    expect(res.body.importedCount).toBe(500);
    expect(await countTransactions(a)).toBe(500);
    expect(await countPending(a)).toBe(0);
  }, 60_000);

  it("rejects a selection of 501 rows with a 400 and changes nothing", async () => {
    const a = await createActor();
    await seedPending(a, 501);

    const res = await batchImport(a, { mode: "filtered" });

    expect(res.status).toBe(400);
    expect(await countTransactions(a)).toBe(0);
    expect(await countPending(a)).toBe(501);
  }, 60_000);

  it("rejects an unknown id on batch ignore and changes nothing", async () => {
    const a = await createActor();
    const [mine] = await seedPending(a, 1);

    const res = await request(app)
      .post("/transactions/imported/batch-ignore")
      .set(bearer(a.token))
      .send({ selection: { mode: "ids", ids: [mine, "does-not-exist"] } });

    expect(res.status).toBe(400);
    expect(await countPending(a)).toBe(1);
  }, 30_000);
});
