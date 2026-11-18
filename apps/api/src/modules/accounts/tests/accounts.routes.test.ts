import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../../../tests/helpers/authTestUser.js";
import {
  startTestDatabase,
  stopTestDatabase
} from "../../../tests/helpers/testDatabase.js";

// NOT run in this sandbox (no Docker) — see docs/TESTING.md.
let app: Express;

// One startTestDatabase()/app import for the whole file — app.js's Prisma
// client (src/db/prisma.ts) is a module-level singleton, so re-importing it
// per describe block doesn't give each block a fresh connection; it just
// leaves later blocks talking to whichever container the first import
// bound to, which earlier blocks' own afterAll may have already stopped.
let env: typeof import("../../../config/env.js").env;

beforeAll(async () => {
  // Pinned before env.ts loads (dotenv never overrides an existing var outside production) so the developer's .env can't decide which Syncfy path runs.
  process.env.SYNCFY_AUTO_SYNC_ENABLED = "true";
  process.env.SYNCFY_API_KEY ??= "test-syncfy-key";
  process.env.SYNCFY_WEBHOOK_SIGNATURE_KEY ??= "test-syncfy-signature-key";
  await startTestDatabase();
  ({ app } = await import("../../../app.js"));
  ({ env } = await import("../../../config/env.js"));
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
});

describe("/accounts routes", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/accounts");
    expect(response.status).toBe(401);
  });

  it("creates, lists, updates, archives, restores, and deletes an account", async () => {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

    const createResponse = await auth(request(app).post("/accounts")).send({
      name: "Checking",
      type: "checking"
    });
    expect(createResponse.status).toBe(201);
    const accountId = createResponse.body.account.id as string;

    const listResponse = await auth(request(app).get("/accounts"));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.accounts).toHaveLength(1);
    expect(listResponse.body.accounts[0]).toMatchObject({ source: "manual" });

    const updateResponse = await auth(
      request(app).put(`/accounts/${accountId}`)
    ).send({ name: "Primary Checking" });
    expect(updateResponse.status).toBe(200);

    const archiveResponse = await auth(
      request(app).post(`/accounts/${accountId}/archive`)
    );
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.account.isArchived).toBe(true);

    const restoreResponse = await auth(
      request(app).post(`/accounts/${accountId}/restore`)
    );
    expect(restoreResponse.status).toBe(200);

    const deleteResponse = await auth(
      request(app).delete(`/accounts/${accountId}`)
    );
    expect(deleteResponse.status).toBe(204);
  });
});

describe("/providers routes", () => {
  it("requires authentication for /providers/connectors", async () => {
    const response = await request(app).get("/providers/connectors");
    expect(response.status).toBe(401);
  });

  it("lists the registered syncfy connector", async () => {
    const { token } = await createAuthedUser(app);

    const response = await request(app)
      .get("/providers/connectors")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.connectors).toEqual(
      expect.arrayContaining([expect.objectContaining({ provider: "syncfy" })])
    );
  });
});

describe("/providers routes with Syncfy switched off", () => {
  it("hides connectors and refuses a new connection with 503, while accounts stay readable", async () => {
    const { token } = await createAuthedUser(app);
    const auth = { Authorization: `Bearer ${token}` };
    env.SYNCFY_AUTO_SYNC_ENABLED = false;

    try {
      const connectors = await request(app).get("/providers/connectors").set(auth);
      expect(connectors.status).toBe(200);
      expect(connectors.body.connectors).toEqual([]);

      const connection = await request(app)
        .post("/providers/connections")
        .set(auth)
        .send({ provider: "syncfy" });
      expect(connection.status).toBe(503);
      expect(connection.body.message).toBe(
        "Bank synchronization is currently unavailable"
      );

      const accounts = await request(app).get("/accounts").set(auth);
      expect(accounts.status).toBe(200);
    } finally {
      env.SYNCFY_AUTO_SYNC_ENABLED = true;
    }
  });
});

describe("/providers/webhooks routes", () => {
  it("needs no access token but rejects an unsigned event with a 401", async () => {
    const response = await request(app)
      .post("/providers/webhooks/syncfy")
      .send({ rid: "rid-1", events: [] });

    expect(response.status).toBe(401);
  });

  it("responds 400 for an unregistered provider on the health check", async () => {
    const response = await request(app).get("/providers/webhooks/unknown-provider");
    expect(response.status).toBe(404);
  });
});

describe("GET /accounts/:id/credit-card", () => {
  const cardBody = {
    name: "Card",
    type: "credit_card",
    currency: "MXN",
    creditLimit: "30000",
    statementClosingDay: 20,
    paymentDueRule: "day_of_next_month",
    paymentDueValue: 20,
    billingTimeZone: "America/Mexico_City",
    annualInterestRate: "60"
  };

  async function setup() {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);
    const card = (await auth(request(app).post("/accounts")).send(cardBody)).body.account.id as string;
    const checking = (
      await auth(request(app).post("/accounts")).send({ name: "Debit", type: "checking", currency: "MXN", initialBalance: "20000" })
    ).body.account.id as string;
    const category = (await auth(request(app).post("/categories")).send({ name: "Food", type: "expense" })).body.category
      .id as string;
    return { auth, card, checking, category };
  }

  async function findPeriod(auth: (req: request.Test) => request.Test, cardId: string, end: string) {
    for (let page = 1; ; page++) {
      const body = (await auth(request(app).get(`/accounts/${cardId}/credit-card?page=${page}`))).body;
      const found = body.periods.find((p: { end: string }) => p.end === end);
      if (found || page * body.pageSize >= body.totalPeriods) return found;
    }
  }

  it("returns card limit and rate as exact decimal strings in the account list", async () => {
    const { auth, card } = await setup();
    const listed = (await auth(request(app).get("/accounts"))).body.accounts.find((a: { id: string }) => a.id === card);
    expect(listed).toMatchObject({ creditLimit: "30000", annualInterestRate: "60", statementClosingDay: 20 });
  });

  it("requires authentication", async () => {
    expect((await request(app).get("/accounts/x/credit-card")).status).toBe(401);
  });

  it("returns metrics and periods computed from transfers and purchases", async () => {
    const { auth, card, checking, category } = await setup();
    const tx = (body: Record<string, unknown>) => auth(request(app).post("/transactions")).send(body);
    await tx({ name: "TV", amount: "5000", type: "expense", date: "2024-10-01T18:00:00Z", accountId: card, categoryId: category });
    await tx({ name: "Pay", amount: "1000", type: "transfer", date: "2024-10-10T18:00:00Z", accountId: checking, transferToAccountId: card });
    await tx({ name: "Pay 2", amount: "2000", type: "transfer", date: "2024-11-01T18:00:00Z", accountId: checking, transferToAccountId: card });

    const response = await auth(request(app).get(`/accounts/${card}/credit-card`));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      configured: true,
      metrics: { debt: "2000", availableCredit: "28000" },
      pageSize: 12
    });
    const october = await findPeriod(auth, card, "2024-10-20");
    expect(october).toMatchObject({
      closingDebt: "4000",
      credits: "2000",
      creditsBreakdown: { transfers: "2000" },
      remaining: "2000",
      status: "overdue"
    });
  });

  it("returns metrics and no periods for an unconfigured card", async () => {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);
    const card = (await auth(request(app).post("/accounts")).send({ name: "Bare", type: "credit_card" })).body.account.id;
    const response = await auth(request(app).get(`/accounts/${card}/credit-card`));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ configured: false, periods: [], totalPeriods: 0 });
  });

  it("returns 404 for a non-card account and for another user's card", async () => {
    const { auth, checking, card } = await setup();
    expect((await auth(request(app).get(`/accounts/${checking}/credit-card`))).status).toBe(404);

    const other = await createAuthedUser(app);
    const foreign = await request(app)
      .get(`/accounts/${card}/credit-card`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(foreign.status).toBe(404);
  });

  it("rejects an invalid page with 400", async () => {
    const { auth, card } = await setup();
    expect((await auth(request(app).get(`/accounts/${card}/credit-card?page=0`))).status).toBe(400);
  });
});

describe("/accounts/:id/holdings", () => {
  async function setupHoldings(type: "crypto" | "investment" | "checking" = "investment") {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);
    const accountId = (await auth(request(app).post("/accounts")).send({ name: "Wallet", type, currency: "USD" })).body
      .account.id as string;
    return { auth, accountId };
  }

  const cash = { kind: "fiat", code: "USD", quantity: "250.50" };
  const btc = {
    kind: "crypto",
    code: "BTC",
    quantity: "0.010000000000000001",
    manualUnitPrice: "60000",
    manualPriceCurrency: "USD"
  };

  it("requires authentication", async () => {
    expect((await request(app).get("/accounts/x/holdings")).status).toBe(401);
    expect((await request(app).patch("/accounts/x/holdings").send({ remove: ["a"] })).status).toBe(401);
  });

  it("creates holdings and returns them with exact strings and the aggregate, matching GET and the account list", async () => {
    const { auth, accountId } = await setupHoldings();
    const patched = await auth(request(app).patch(`/accounts/${accountId}/holdings`)).send({ upsert: [cash, btc] });

    expect(patched.status).toBe(200);
    expect(patched.body.valuation).toMatchObject({ currency: "USD", value: "850.50", status: "complete", missingCount: 0 });
    const hBtc = patched.body.holdings.find((h: { code: string }) => h.code === "BTC");
    expect(hBtc).toMatchObject({ quantity: "0.010000000000000001", manualUnitPrice: "60000" });
    expect(hBtc.valuation).toMatchObject({ source: "manual", priceCurrency: "USD" });

    const got = await auth(request(app).get(`/accounts/${accountId}/holdings`));
    expect(got.body).toEqual(patched.body);
    const list = await auth(request(app).get("/accounts"));
    expect(list.body.accounts[0].holdingsValuation).toEqual(patched.body.valuation);
  });

  it("updates one holding and removes another, leaving unmentioned holdings untouched", async () => {
    const { auth, accountId } = await setupHoldings("investment");
    const created = await auth(request(app).patch(`/accounts/${accountId}/holdings`)).send({ upsert: [cash, btc] });
    const byCode = (code: string) => created.body.holdings.find((h: { code: string }) => h.code === code);

    const next = await auth(request(app).patch(`/accounts/${accountId}/holdings`)).send({
      upsert: [{ id: byCode("USD").id, quantity: "100" }],
      remove: [byCode("BTC").id]
    });
    expect(next.status).toBe(200);
    expect(next.body.holdings).toHaveLength(1);
    expect(next.body.valuation.value).toBe("100.00");
  });

  it("returns 400 for an invalid body, an ineligible account type and a duplicate asset", async () => {
    const { auth, accountId } = await setupHoldings();
    const path = `/accounts/${accountId}/holdings`;
    expect((await auth(request(app).patch(path)).send({ upsert: [{ kind: "fiat", code: "USD", quantity: "10.005" }] })).status).toBe(400);
    expect((await auth(request(app).patch(path)).send({})).status).toBe(400);
    expect((await auth(request(app).patch(path)).send({ upsert: [cash, cash] })).status).toBe(400);

    const checking = await setupHoldings("checking");
    expect(
      (await checking.auth(request(app).patch(`/accounts/${checking.accountId}/holdings`)).send({ upsert: [cash] })).status
    ).toBe(400);
  });

  it("returns 404 for another user's account and for a holding id from another account", async () => {
    const owner = await setupHoldings();
    const created = await owner.auth(request(app).patch(`/accounts/${owner.accountId}/holdings`)).send({ upsert: [cash] });
    const holdingId = created.body.holdings[0].id as string;

    const intruder = await setupHoldings();
    expect((await intruder.auth(request(app).get(`/accounts/${owner.accountId}/holdings`))).status).toBe(404);
    expect(
      (await intruder.auth(request(app).patch(`/accounts/${owner.accountId}/holdings`)).send({ remove: [holdingId] })).status
    ).toBe(404);
    expect(
      (await intruder.auth(request(app).patch(`/accounts/${intruder.accountId}/holdings`)).send({ remove: [holdingId] })).status
    ).toBe(404);
    expect((await owner.auth(request(app).get(`/accounts/${owner.accountId}/holdings`))).body.holdings).toHaveLength(1);
  });

  it("rolls back the whole change set when one item is invalid", async () => {
    const { auth, accountId } = await setupHoldings();
    const path = `/accounts/${accountId}/holdings`;
    const created = await auth(request(app).patch(path)).send({ upsert: [cash] });
    const cashId = created.body.holdings[0].id as string;

    const failed = await auth(request(app).patch(path)).send({
      upsert: [{ id: cashId, quantity: "1" }, { kind: "fiat", code: "USD", quantity: "5" }]
    });
    expect(failed.status).toBe(400);
    expect((await auth(request(app).get(path))).body.holdings[0].quantity).toBe("250.5");
  });

  it("rejects a type change away from holdings while holdings exist", async () => {
    const { auth, accountId } = await setupHoldings();
    await auth(request(app).patch(`/accounts/${accountId}/holdings`)).send({ upsert: [cash] });
    expect((await auth(request(app).put(`/accounts/${accountId}`)).send({ type: "savings" })).status).toBe(400);
    expect((await auth(request(app).put(`/accounts/${accountId}`)).send({ type: "investment" })).status).toBe(200);
  });

  it("deletes holdings with their account", async () => {
    const { auth, accountId } = await setupHoldings();
    await auth(request(app).patch(`/accounts/${accountId}/holdings`)).send({ upsert: [cash] });
    const { prisma } = await import("../../../db/prisma.js");
    expect(await prisma.holding.count({ where: { accountId } })).toBe(1);

    expect((await auth(request(app).delete(`/accounts/${accountId}`))).status).toBe(204);
    expect(await prisma.holding.count({ where: { accountId } })).toBe(0);
  });
  it.each(["fiat", "stock"])("rejects %s in a crypto account without persisting it", async (kind) => {
    const { auth, accountId } = await setupHoldings("crypto");
    const path = `/accounts/${accountId}/holdings`;
    const response = await auth(request(app).patch(path)).send({ upsert: [{ kind, code: kind === "fiat" ? "USD" : "AAPL", quantity: "1", ...(kind === "stock" ? { manualUnitPrice: "10", manualPriceCurrency: "USD" } : {}) }] });
    expect(response.status).toBe(400);
    expect((await auth(request(app).get(path))).body).toMatchObject({ holdings: [], valuation: { value: "0.00", status: "empty", holdingCount: 0 } });
  });

  it("persists stock, ETF and multiple named assets and blocks investment to crypto", async () => {
    const { auth, accountId } = await setupHoldings("investment");
    const path = `/accounts/${accountId}/holdings`;
    const price = { quantity: "2", manualUnitPrice: "10", manualPriceCurrency: "USD" };
    const response = await auth(request(app).patch(path)).send({ upsert: [
      { ...price, kind: "stock", code: "AAPL" },
      { ...price, kind: "etf", code: "VOO" },
      { ...price, kind: "other", name: "Gold", unit: "oz" },
      { ...price, kind: "other", name: "Art" }
    ] });
    expect(response.status).toBe(200);
    expect(response.body.valuation).toMatchObject({ value: "80.00", holdingCount: 4 });
    expect(response.body.holdings.find((h: { name: string | null }) => h.name === "Gold")).toMatchObject({ code: null, unit: "oz" });
    expect((await auth(request(app).put(`/accounts/${accountId}`)).send({ type: "crypto" })).status).toBe(400);
  });

  it("keeps incompatible stored cash readable, rejects updates and allows removal", async () => {
    const { auth, accountId } = await setupHoldings("crypto");
    const { prisma } = await import("../../../db/prisma.js");
    const account = await prisma.account.findUniqueOrThrow({ where: { id: accountId } });
    const holding = await prisma.holding.create({ data: { accountId, userId: account.userId, kind: "fiat", code: "USD", quantity: "10" } });
    const path = `/accounts/${accountId}/holdings`;
    expect((await auth(request(app).get(path))).body.valuation).toMatchObject({ value: "10.00", holdingCount: 1 });
    expect((await auth(request(app).patch(path)).send({ upsert: [{ id: holding.id, quantity: "20" }] })).status).toBe(400);
    const removed = await auth(request(app).patch(path)).send({ remove: [holding.id] });
    expect(removed.status).toBe(200);
    expect(removed.body.valuation).toMatchObject({ value: "0.00", status: "empty", holdingCount: 0 });
  });

  describe("provider-linked securities", () => {
    const linked = { kind: "stock", code: "AAPL", exchange: "XNGS", quoteCurrency: "USD", name: "Apple Inc.", quantity: "10" };

    async function seedQuote(price: string, currency = "USD") {
      const { prisma } = await import("../../../db/prisma.js");
      await prisma.securityQuote.upsert({
        where: { symbol_exchange: { symbol: "AAPL", exchange: "XNGS" } },
        create: { symbol: "AAPL", exchange: "XNGS", price, currency, quotedAt: new Date("2026-11-16T20:59:00Z"), checkedAt: new Date(), marketOpen: false },
        update: { price, currency }
      });
    }

    it("stores a linked holding without a price, values it from the shared quote and shares one quote across accounts", async () => {
      await seedQuote("352.78");
      const one = await setupHoldings("investment");
      const two = await setupHoldings("investment");
      const first = await one.auth(request(app).patch(`/accounts/${one.accountId}/holdings`)).send({ upsert: [linked] });
      const second = await two.auth(request(app).patch(`/accounts/${two.accountId}/holdings`)).send({ upsert: [{ ...linked, quantity: "1" }] });

      expect(first.status).toBe(200);
      expect(first.body.holdings[0]).toMatchObject({
        exchange: "XNGS",
        quoteCurrency: "USD",
        name: "Apple Inc.",
        valuation: { source: "market", unitPrice: "352.78", value: "3527.80" },
        marketQuote: { provider: "twelve_data", price: "352.78", stale: false }
      });
      expect(second.body.holdings[0].valuation).toMatchObject({ value: "352.78" });
      expect(first.body.valuation).toMatchObject({ value: "3527.80", status: "complete" });
    });

    it("rejects a duplicate listing and a duplicate unlinked ticker in one account", async () => {
      const { auth, accountId } = await setupHoldings("investment");
      const path = `/accounts/${accountId}/holdings`;
      expect((await auth(request(app).patch(path)).send({ upsert: [linked] })).status).toBe(200);
      expect((await auth(request(app).patch(path)).send({ upsert: [linked] })).status).toBe(400);
      const manual = { kind: "stock", code: "AAPL", quantity: "1", manualUnitPrice: "1", manualPriceCurrency: "USD" };
      expect((await auth(request(app).patch(path)).send({ upsert: [manual] })).status).toBe(200);
      expect((await auth(request(app).patch(path)).send({ upsert: [manual] })).status).toBe(400);
    });

    it("refreshes only the caller's own account and returns the GET body", async () => {
      const mine = await setupHoldings("investment");
      const theirs = await setupHoldings("investment");
      await mine.auth(request(app).patch(`/accounts/${mine.accountId}/holdings`)).send({ upsert: [linked] });

      const refreshed = await mine.auth(request(app).post(`/accounts/${mine.accountId}/holdings/refresh`));
      const got = await mine.auth(request(app).get(`/accounts/${mine.accountId}/holdings`));
      expect(refreshed.status).toBe(200);
      expect(refreshed.body).toEqual(got.body);

      expect((await theirs.auth(request(app).post(`/accounts/${mine.accountId}/holdings/refresh`))).status).toBe(404);
      expect((await request(app).post(`/accounts/${mine.accountId}/holdings/refresh`)).status).toBe(401);
    });
  });
});
