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
