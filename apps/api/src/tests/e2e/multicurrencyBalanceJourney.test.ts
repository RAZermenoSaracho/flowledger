import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

let app: Express;
let prisma: typeof import("../../db/prisma.js").prisma;

describe("multi-currency balance journey (exact native amounts)", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("keeps balances exact across transfer, correction, deletion and crypto", async () => {
    const registered = await request(app).post("/auth/register").send({
      name: "Multi Currency",
      email: "multicurrency@example.com",
      password: "longenoughpassword"
    });
    const auth = { Authorization: `Bearer ${registered.body.token as string}` };

    const createAccount = async (name: string, currency: string) => {
      const res = await request(app)
        .post("/accounts")
        .set(auth)
        .send({ name, type: "checking", currency, initialBalance: "0" });
      expect(res.status).toBe(201);
      return res.body.account.id as string;
    };
    const balances = async () => {
      const res = await request(app).get("/accounts").set(auth);
      return Object.fromEntries(
        res.body.accounts.map((a: { name: string; currentBalance: string }) => [
          a.name,
          a.currentBalance
        ])
      ) as Record<string, string>;
    };

    const usd = await createAccount("USD", "USD");
    const mxn = await createAccount("MXN", "MXN");
    const btc = await createAccount("BTC", "BTC");

    const transfer = (amount: unknown, destinationAmount: string) => ({
      name: "Move",
      type: "transfer",
      amount,
      executionCurrency: "USD",
      destinationAmount,
      date: "2024-03-01",
      accountId: usd,
      transferToAccountId: mxn
    });

    const created = await request(app)
      .post("/transactions")
      .set(auth)
      .send(transfer("100", "1712.50"));
    expect(created.status).toBe(201);
    const id = created.body.transaction.id as string;
    expect(await balances()).toMatchObject({ USD: "-100", MXN: "1712.5" });

    const edited = await request(app)
      .put(`/transactions/${id}`)
      .set(auth)
      .send(transfer("100", "1690"));
    expect(edited.status).toBe(200);
    expect(await balances()).toMatchObject({ USD: "-100", MXN: "1690" });
    const updates = await prisma.transactionCorrection.findMany({
      where: { transactionId: id, action: "update" }
    });
    expect(updates).toHaveLength(1);

    expect((await request(app).delete(`/transactions/${id}`).set(auth)).status).toBe(204);
    expect(await balances()).toMatchObject({ USD: "0", MXN: "0" });
    const deletions = await prisma.transactionCorrection.findMany({
      where: { transactionId: id, action: "delete" }
    });
    expect(deletions).toHaveLength(1);

    const btcTx = (amount: unknown, accountId = btc, currency = "BTC") => ({
      name: "Sats",
      type: "income",
      amount,
      executionCurrency: currency,
      date: "2024-03-02",
      accountId
    });
    const precise = await request(app)
      .post("/transactions")
      .set(auth)
      .send(btcTx("1.234567890123456789"));
    expect(precise.status).toBe(201);
    expect(precise.body.transaction.amount).toBe("1.234567890123456789");
    expect((await balances()).BTC).toBe("1.234567890123456789");

    const tooPrecise = await request(app)
      .post("/transactions")
      .set(auth)
      .send(btcTx("1.0000000000000000001"));
    expect(tooPrecise.status).toBe(400);
    const fiat = await request(app)
      .post("/transactions")
      .set(auth)
      .send(btcTx("10.005", usd, "USD"));
    expect(fiat.status).toBe(400);
    const asNumber = await request(app)
      .post("/transactions")
      .set(auth)
      .send(btcTx(4.5));
    expect(asNumber.status).toBe(400);
  });
});
