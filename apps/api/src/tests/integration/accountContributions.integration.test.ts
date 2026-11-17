import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test: needs Docker (see docs/TESTING.md).
let app: Express;

beforeAll(async () => {
  await startTestDatabase();
  ({ app } = await import("../../app.js"));
}, 180_000);
afterAll(async () => { await stopTestDatabase(); }, 60_000);

describe("account contributions lifecycle", () => {
  it("recomputes transfers after creation, edits and deletion while preserving holdings value", async () => {
    const { token } = await createAuthedUser(app);
    const auth = { Authorization: `Bearer ${token}` };
    const checking = await request(app).post("/accounts").set(auth).send({ name: "Checking", type: "checking", currency: "USD", initialBalance: "1000" });
    const investment = await request(app).post("/accounts").set(auth).send({ name: "Investment", type: "investment", currency: "USD", initialBalance: "999" });
    expect(checking.status).toBe(201);
    expect(investment.status).toBe(201);
    const source = checking.body.account.id as string;
    const destination = investment.body.account.id as string;
    const holdings = await request(app).patch(`/accounts/${destination}/holdings`).set(auth).send({ upsert: [{ kind: "fiat", code: "USD", quantity: "50" }] });
    expect(holdings.status).toBe(200);

    const check = async (incoming: string, outgoing: string, net: string, transferCount: number) => {
      const response = await request(app).get("/accounts").set(auth);
      expect(response.status).toBe(200);
      const account = response.body.accounts.find((row: { id: string }) => row.id === destination);
      expect(account.contributions).toEqual({ currency: "USD", incoming, outgoing, net, transferCount, excludedCount: 0 });
      expect(account.holdingsValuation.value).toBe("50.00");
      expect(response.body.accounts.find((row: { id: string }) => row.id === source).contributions).toBeNull();
    };
    const transfer = async (accountId: string, transferToAccountId: string, amount: string) => {
      const response = await request(app).post("/transactions").set(auth).send({ name: "Transfer", type: "transfer", date: "2026-11-01T12:00:00Z", accountId, transferToAccountId, amount });
      expect(response.status).toBe(201);
      return response.body.transaction.id as string;
    };

    await check("0.00", "0.00", "0.00", 0);
    const incomingId = await transfer(source, destination, "200");
    await check("200.00", "0.00", "200.00", 1);
    const outgoingId = await transfer(destination, source, "30");
    await check("200.00", "30.00", "170.00", 2);
    const edited = await request(app).put(`/transactions/${incomingId}`).set(auth).send({ amount: "250" });
    expect(edited.status).toBe(200);
    await check("250.00", "30.00", "220.00", 2);
    expect((await request(app).delete(`/transactions/${outgoingId}`).set(auth)).status).toBe(204);
    await check("250.00", "0.00", "250.00", 1);
    expect((await request(app).delete(`/transactions/${incomingId}`).set(auth)).status).toBe(204);
    await check("0.00", "0.00", "0.00", 0);
  });
});
