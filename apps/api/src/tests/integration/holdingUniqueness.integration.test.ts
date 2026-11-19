import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Express } from "express";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { loopbackOrigin } from "../helpers/loopback.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test: needs Docker (see CLAUDE.local.md). Concurrent holding creates race through real HTTP
// requests against a testcontainers Postgres, so only the database indexes can decide the winner.
let app: Express;
let server: Server;
let baseUrl: string;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];
let token: string;
let auth: { Authorization: string };

const duplicateMessage = (label: string) => `This account already contains a holding for ${label}. Edit the existing holding instead.`;
const INTERNALS = /P2002|Unique constraint|Holding_accountId|prisma/i;

type Item = Record<string, unknown>;

async function newAccount(type = "investment", body: Record<string, unknown> = {}) {
  const response = await request(app)
    .post("/accounts")
    .set(auth)
    .send({ name: `Acct ${Math.random()}`, type, currency: "USD", initialBalance: "0", ...body });
  expect(response.status).toBe(201);
  return response.body.account.id as string;
}

function patch(accountId: string, change: { upsert?: Item[]; remove?: string[] }) {
  return request(app).patch(`/accounts/${accountId}/holdings`).set(auth).send(change);
}

function race(accountId: string, item: Item, times: number) {
  return Promise.all(Array.from({ length: times }, () => patch(accountId, { upsert: [item] })));
}

function expectDuplicate(response: request.Response, label: string, holding: Record<string, unknown>) {
  expect(response.status).toBe(409);
  expect(response.body).toMatchObject({
    message: duplicateMessage(label),
    code: "duplicate_holding",
    holding,
    issues: { formErrors: [], fieldErrors: { "upsert.0.code": [duplicateMessage(label)] } }
  });
  expect(JSON.stringify(response.body)).not.toMatch(INTERNALS);
}

function expectOneWinner(responses: request.Response[], label: string, holding: Record<string, unknown>) {
  expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
  const losers = responses.filter((r) => r.status !== 200);
  expect(losers).toHaveLength(responses.length - 1);
  for (const loser of losers) {
    expectDuplicate(loser, label, holding);
  }
}

const rows = (accountId: string) => prisma.holding.findMany({ where: { accountId } });

async function mintWriteKey() {
  const response = await request(app)
    .post("/users/me/api-keys")
    .set(auth)
    .send({ name: "holding-uniqueness", allowWrite: true, lifetime: "1m" });
  return response.body.key as string;
}

beforeAll(async () => {
  await startTestDatabase();
  ({ app } = await import("../../app.js"));
  ({ prisma } = await import("../../db/prisma.js"));
  server = app.listen(0);
  baseUrl = loopbackOrigin(server);
  ({ token } = await createAuthedUser(app));
  auth = { Authorization: `Bearer ${token}` };
}, 180_000);

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await stopTestDatabase();
}, 60_000);

describe("partial unique index", () => {
  it("exists and covers only rows without an exchange", async () => {
    const found = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'Holding' AND indexname = 'Holding_accountId_kind_code_unlinked_key'`;
    expect(found).toHaveLength(1);
    expect(found[0]!.indexdef).toContain("UNIQUE");
    expect(found[0]!.indexdef).toContain('("accountId", kind, code)');
    expect(found[0]!.indexdef).toContain("WHERE (exchange IS NULL)");
  });
});

describe("concurrent creates of the same holding", () => {
  it("lets exactly one of two simultaneous crypto creates win", async () => {
    const accountId = await newAccount("crypto");
    expectOneWinner(await race(accountId, { kind: "crypto", code: "BTC", quantity: "1" }, 2), "BTC", {
      kind: "crypto", code: "BTC", exchange: null
    });
    expect(await rows(accountId)).toHaveLength(1);
  });

  it("lets exactly one of five simultaneous fiat cash creates win", async () => {
    const accountId = await newAccount();
    expectOneWinner(await race(accountId, { kind: "fiat", code: "USD", quantity: "10" }, 5), "USD", {
      kind: "fiat", code: "USD", exchange: null
    });
    expect(await rows(accountId)).toHaveLength(1);
  });

  it("lets exactly one of five simultaneous unlinked stock creates win", async () => {
    const accountId = await newAccount();
    const item = { kind: "stock", code: "TSLA", quantity: "2", manualUnitPrice: "100", manualPriceCurrency: "USD" };
    expectOneWinner(await race(accountId, item, 5), "TSLA", { kind: "stock", code: "TSLA", exchange: null });
    expect(await rows(accountId)).toHaveLength(1);
  });

  it("lets exactly one of five simultaneous linked stock creates win", async () => {
    const accountId = await newAccount();
    const item = {
      kind: "stock", code: "AAPL", exchange: "XNGS", quoteCurrency: "USD",
      quantity: "2", manualUnitPrice: "100", manualPriceCurrency: "USD"
    };
    expectOneWinner(await race(accountId, item, 5), "AAPL (XNGS)", { kind: "stock", code: "AAPL", exchange: "XNGS" });
    expect(await rows(accountId)).toHaveLength(1);
  });

  it("keeps an update winning while a concurrent duplicate create is rejected", async () => {
    const accountId = await newAccount("crypto");
    const seeded = await patch(accountId, { upsert: [{ kind: "crypto", code: "BTC", quantity: "1" }] });
    const id = seeded.body.holdings[0].id as string;
    const [update, create] = await Promise.all([
      patch(accountId, { upsert: [{ id, quantity: "5" }] }),
      patch(accountId, { upsert: [{ kind: "crypto", code: "BTC", quantity: "9" }] })
    ]);
    expect(update.status).toBe(200);
    expectDuplicate(create, "BTC", { kind: "crypto", code: "BTC", exchange: null });
    const stored = await rows(accountId);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.quantity.toString()).toBe("5");
  });

  it("counts one holding and leaves the account's transactions untouched after a race", async () => {
    const accountId = await newAccount();
    const created = await request(app)
      .post("/transactions")
      .set(auth)
      .send({ name: "Fee", amount: "5", type: "expense", date: "2026-11-01", accountId });
    expect(created.status).toBe(201);
    const before = await prisma.transaction.findMany({ where: { accountId } });
    expect(before).toHaveLength(1);

    expectOneWinner(await race(accountId, { kind: "fiat", code: "USD", quantity: "100" }, 5), "USD", {
      kind: "fiat", code: "USD", exchange: null
    });

    const read = await request(app).get(`/accounts/${accountId}/holdings`).set(auth);
    expect(read.status).toBe(200);
    expect(read.body.holdings).toHaveLength(1);
    expect(read.body.valuation).toMatchObject({ value: "100.00", holdingCount: 1 });
    expect(await prisma.transaction.findMany({ where: { accountId } })).toEqual(before);
  });
});

describe("duplicate rejection", () => {
  it("rejects a lower-case code that matches an existing upper-case holding", async () => {
    const accountId = await newAccount("crypto");
    expect((await patch(accountId, { upsert: [{ kind: "crypto", code: "BTC", quantity: "1" }] })).status).toBe(200);
    const duplicate = await patch(accountId, { upsert: [{ kind: "crypto", code: "btc", quantity: "2" }] });
    expectDuplicate(duplicate, "BTC", { kind: "crypto", code: "BTC", exchange: null });
    expect(await rows(accountId)).toHaveLength(1);
  });

  it("returns a clean duplicate message over REST and the MCP update_holdings tool", async () => {
    const accountId = await newAccount("crypto");
    const item = { kind: "crypto", code: "ETH", quantity: "1" };
    expect((await patch(accountId, { upsert: [item] })).status).toBe(200);

    const rest = await patch(accountId, { upsert: [item] });
    expectDuplicate(rest, "ETH", { kind: "crypto", code: "ETH", exchange: null });

    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
        requestInit: { headers: { Authorization: `Bearer ${await mintWriteKey()}` } }
      })
    );
    const mcp = (await client.callTool({
      name: "update_holdings",
      arguments: { id: accountId, upsert: [item] }
    })) as { isError?: boolean; content: { text: string }[] };
    await client.close();
    expect(mcp.isError).toBe(true);
    expect(mcp.content[0]!.text).toContain(duplicateMessage("ETH"));
    expect(mcp.content[0]!.text).not.toMatch(INTERNALS);
    expect(await rows(accountId)).toHaveLength(1);
  });
});

describe("linked duplicate pre-check", () => {
  it("409s naming the listing when a saved linked holding is created again", async () => {
    const accountId = await newAccount();
    const item = {
      kind: "stock", code: "AAPL", exchange: "XNGS", quoteCurrency: "USD",
      quantity: "1", manualUnitPrice: "10", manualPriceCurrency: "USD"
    };
    expect((await patch(accountId, { upsert: [item] })).status).toBe(200);
    expectDuplicate(await patch(accountId, { upsert: [item] }), "AAPL (XNGS)", { kind: "stock", code: "AAPL", exchange: "XNGS" });
    expect(await rows(accountId)).toHaveLength(1);
  });
});

describe("distinct holdings that must stay allowed", () => {
  it("allows the same BTC in two accounts of one user", async () => {
    const first = await newAccount("crypto");
    const second = await newAccount("crypto");
    expect((await patch(first, { upsert: [{ kind: "crypto", code: "BTC", quantity: "1" }] })).status).toBe(200);
    expect((await patch(second, { upsert: [{ kind: "crypto", code: "BTC", quantity: "1" }] })).status).toBe(200);
  });

  it("allows AAPL on two different exchanges in one account", async () => {
    const accountId = await newAccount();
    const price = { quantity: "1", manualUnitPrice: "10", manualPriceCurrency: "USD" };
    const response = await patch(accountId, {
      upsert: [
        { kind: "stock", code: "AAPL", exchange: "XNGS", quoteCurrency: "USD", ...price },
        { kind: "stock", code: "AAPL", exchange: "XLON", quoteCurrency: "GBP", ...price }
      ]
    });
    expect(response.status).toBe(200);
    expect(await rows(accountId)).toHaveLength(2);
  });

  it("allows a linked AAPL next to an unlinked AAPL", async () => {
    const accountId = await newAccount();
    const price = { quantity: "1", manualUnitPrice: "10", manualPriceCurrency: "USD" };
    const response = await patch(accountId, {
      upsert: [
        { kind: "stock", code: "AAPL", exchange: "XNGS", quoteCurrency: "USD", ...price },
        { kind: "stock", code: "AAPL", ...price }
      ]
    });
    expect(response.status).toBe(200);
    expect(await rows(accountId)).toHaveLength(2);
  });

  it("allows a stock and an ETF with the same code", async () => {
    const accountId = await newAccount();
    const price = { quantity: "1", manualUnitPrice: "10", manualPriceCurrency: "USD" };
    const response = await patch(accountId, {
      upsert: [
        { kind: "stock", code: "AAPL", ...price },
        { kind: "etf", code: "AAPL", ...price }
      ]
    });
    expect(response.status).toBe(200);
    expect(await rows(accountId)).toHaveLength(2);
  });

  it("allows two other holdings with the same name", async () => {
    const accountId = await newAccount();
    const other = { kind: "other", name: "Vintage watch", quantity: "1", manualUnitPrice: "500", manualPriceCurrency: "USD" };
    expect((await patch(accountId, { upsert: [other] })).status).toBe(200);
    expect((await patch(accountId, { upsert: [other] })).status).toBe(200);
    expect(await rows(accountId)).toHaveLength(2);
  });

  it("allows removing BTC and re-creating it in the same change set", async () => {
    const accountId = await newAccount("crypto");
    const seeded = await patch(accountId, { upsert: [{ kind: "crypto", code: "BTC", quantity: "1" }] });
    const id = seeded.body.holdings[0].id as string;
    const response = await patch(accountId, {
      remove: [id],
      upsert: [{ kind: "crypto", code: "BTC", quantity: "3" }]
    });
    expect(response.status).toBe(200);
    const stored = await rows(accountId);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.id).not.toBe(id);
    expect(stored[0]!.quantity.toString()).toBe("3");
  });
});
