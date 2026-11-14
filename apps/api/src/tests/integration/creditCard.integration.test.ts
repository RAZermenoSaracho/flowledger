import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Express } from "express";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, closingDateOf, periodIndexContaining, startOfLocalDay } from "../../modules/accounts/utils/creditCardCycle.js";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { loopbackOrigin } from "../helpers/loopback.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test: needs Docker (see docs/TESTING.md). A real Pyodide sandbox run backs the notification-model path.
let app: Express;
let server: Server;
let baseUrl: string;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];
let NotificationRunWorker: typeof import("../../modules/notificationModels/notificationRunWorker.js").NotificationRunWorker;

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const ZONE = "America/Mexico_City";
const CYCLE = { statementClosingDay: 20, paymentDueRule: "day_of_next_month", paymentDueValue: 20, billingTimeZone: ZONE } as const;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let jwt: string;
let userId: string;
let debitId: string;
let categoryId: string;
let purchaseAt: string;
let writeKey: string;
let mcp: Client;

async function ok<T extends { status: number; body: Json }>(res: T) {
  expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
  return res.body;
}

async function createCard(name: string) {
  const body = await ok(
    await request(app).post("/accounts").set(bearer(jwt)).send({ name, type: "credit_card", currency: "MXN", creditLimit: "50000", ...CYCLE })
  );
  const id = body.account.id as string;
  await ok(
    await request(app)
      .post("/transactions")
      .set(bearer(jwt))
      .send({ name: "Purchase", amount: "10000", type: "expense", date: purchaseAt, accountId: id, categoryId })
  );
  return id;
}

async function billing(cardId: string) {
  const res = await request(app).get(`/accounts/${cardId}/credit-card`).set(bearer(jwt));
  expect(res.status).toBe(200);
  const { accountId: _accountId, ...rest } = res.body as Json;
  return rest;
}

/** Closed period that holds the payment: figures that must be identical across every creation path. */
function summarize(body: Json) {
  const period = body.periods.find((p: Json) => p.status !== "open");
  return { debt: body.metrics.debt, closingDebt: period.closingDebt, credits: period.credits, remaining: period.remaining };
}

describe("credit card billing across write paths (real Postgres)", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    ({ NotificationRunWorker } = await import("../../modules/notificationModels/notificationRunWorker.js"));
    server = app.listen(0);
    baseUrl = loopbackOrigin(server);

    const auth = await createAuthedUser(app);
    jwt = auth.token;
    userId = auth.user.id;
    debitId = (await ok(await request(app).post("/accounts").set(bearer(jwt)).send({ name: "Debit", type: "checking", currency: "MXN" }))).account.id;
    categoryId = (await ok(await request(app).post("/categories").set(bearer(jwt)).send({ name: "Food", type: "expense" }))).category.id;
    writeKey = (await ok(await request(app).post("/users/me/api-keys").set(bearer(jwt)).send({ name: "w", allowWrite: true, lifetime: "1m" }))).key;
    mcp = new Client({ name: "test", version: "1.0.0" });
    await mcp.connect(new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers: bearer(writeKey) } }));

    // Purchase 5 days before the latest closing so the payment made now falls in that period's payment window.
    const now = new Date();
    const config = { ...CYCLE };
    const closing = closingDateOf(config, periodIndexContaining(config, now) - 1);
    purchaseAt = new Date(startOfLocalDay(addDays(closing, -5), ZONE).getTime() + 12 * 3_600_000).toISOString();
  }, 180_000);

  afterAll(async () => {
    await mcp?.close();
    server?.close();
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it("a 6000 debit-to-card payment from web, /v1, MCP and a notification model yields identical billing; edit and delete recalculate", async () => {
    const cards = { web: await createCard("Web"), v1: await createCard("V1"), mcp: await createCard("MCP"), nm: await createCard("NM") };
    const paidAt = new Date().toISOString();
    const payment = (amount: string, cardId: string) => ({
      name: "Card payment", amount, type: "transfer", date: paidAt, accountId: debitId, transferToAccountId: cardId
    });
    const ids: Record<string, string> = {};

    ids.web = (await ok(await request(app).post("/transactions").set(bearer(jwt)).send(payment("6000", cards.web)))).transaction.id;
    ids.v1 = (await ok(await request(app).post("/v1/transactions").set(bearer(writeKey)).send(payment("6000", cards.v1)))).transaction.id;
    const viaMcp = await mcp.callTool({ name: "create_transaction", arguments: payment("6000", cards.mcp) });
    expect(viaMcp.isError).toBeFalsy();
    ids.mcp = (viaMcp.structuredContent as Json).transaction.id;

    const modelId = (
      await ok(
        await request(app)
          .post("/notification-models")
          .set(bearer(jwt))
          .send({
            name: "Pay card",
            code: 'def process(text, ctx):\n    return transfer("6000.00", "Card payment", "debit", "card")',
            slots: [
              { key: "debit", kind: "account", label: "Debit", required: true },
              { key: "card", kind: "account", label: "Card", required: true }
            ],
            bindings: { debit: debitId, card: cards.nm },
            isActive: true
          })
      )
    ).model.id as string;
    const ingestKey = (await ok(await request(app).post("/users/me/api-keys").set(bearer(jwt)).send({ name: "ingest", ingestOnly: true }))).key;
    const ingested = await request(app).post(`/v1/notification-models/${modelId}/notifications`).set(bearer(ingestKey)).send({ text: "pay card" });
    expect(ingested.status, JSON.stringify(ingested.body)).toBe(202);
    const worker = new NotificationRunWorker();
    await worker.start();
    try {
      const deadline = Date.now() + 120_000;
      for (;;) {
        const run = await prisma.notificationRun.findUniqueOrThrow({ where: { id: ingested.body.runId } });
        if (["completed", "skipped", "failed"].includes(run.status)) {
          expect(run, JSON.stringify(run)).toMatchObject({ status: "completed" });
          ids.nm = run.transactionId!;
          break;
        }
        if (Date.now() > deadline) throw new Error("notification run timed out");
        await sleep(200);
      }
    } finally {
      await worker.stop();
    }

    const expectAll = async (expected: ReturnType<typeof summarize>, only = Object.keys(cards)) => {
      const bodies = await Promise.all(only.map((key) => billing(cards[key as keyof typeof cards])));
      for (const body of bodies) expect(summarize(body)).toEqual(expected);
      for (const body of bodies) expect(body).toEqual(bodies[0]);
    };

    await expectAll({ debt: "4000", closingDebt: "10000", credits: "6000", remaining: "4000" });

    for (const key of Object.keys(cards)) {
      await ok(await request(app).put(`/transactions/${ids[key]}`).set(bearer(jwt)).send(payment("4000", cards[key as keyof typeof cards])));
    }
    await expectAll({ debt: "6000", closingDebt: "10000", credits: "4000", remaining: "6000" });

    for (const key of Object.keys(cards)) {
      expect((await request(app).delete(`/transactions/${ids[key]}`).set(bearer(jwt))).status).toBeLessThan(300);
    }
    await expectAll({ debt: "10000", closingDebt: "10000", credits: "0", remaining: "10000" });
  }, 240_000);

  it("a pending Syncfy-style import does not change billing; booking it reduces debt without a category", async () => {
    const cardId = await createCard("Imported");
    const providerAccount = await prisma.providerAccount.create({
      data: { userId, accountId: cardId, provider: "test", providerCredentialId: "cred", providerAccountId: "card-1" }
    });
    const imported = await prisma.providerImportedTransaction.create({
      data: {
        userId, provider: "test", providerCredentialId: "cred", providerAccountId: "card-1", providerAccountRefId: providerAccount.id,
        providerTransactionId: "card-payment-1", description: "Pago tarjeta", amount: 2500, currency: "MXN",
        transactionDate: new Date(), rawData: {}
      }
    });

    expect(summarize(await billing(cardId))).toMatchObject({ debt: "10000", credits: "0" });

    await ok(await request(app).post(`/transactions/imported/${imported.id}/import`).set(bearer(jwt)).send({}));
    expect(summarize(await billing(cardId))).toEqual({ debt: "7500", closingDebt: "10000", credits: "2500", remaining: "7500" });
  }, 60_000);
});
