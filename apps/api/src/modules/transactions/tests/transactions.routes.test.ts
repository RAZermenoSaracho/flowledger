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

describe("/transactions routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
  }, 120_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  it("requires authentication", async () => {
    const response = await request(app).get("/transactions");
    expect(response.status).toBe(401);
  });

  it("creates, lists, fetches, updates, and deletes a transaction", async () => {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

    const accountResponse = await auth(request(app).post("/accounts")).send({
      name: "Checking",
      type: "checking"
    });
    const categoryResponse = await auth(request(app).post("/categories")).send({
      name: "Groceries",
      type: "expense"
    });

    const createResponse = await auth(request(app).post("/transactions")).send({
      name: "Groceries",
      amount: "42.5",
      type: "expense",
      date: "2024-01-15",
      accountId: accountResponse.body.account.id,
      categoryId: categoryResponse.body.category.id
    });
    expect(createResponse.status).toBe(201);
    const transactionId = createResponse.body.transaction.id as string;

    const listResponse = await auth(request(app).get("/transactions"));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.data).toHaveLength(1);

    const getResponse = await auth(
      request(app).get(`/transactions/${transactionId}`)
    );
    expect(getResponse.status).toBe(200);

    const summaryResponse = await auth(request(app).get("/transactions/summary"));
    expect(summaryResponse.status).toBe(200);
    expect(summaryResponse.body).toMatchObject({ income: 0, expenses: 42.5 });

    const updateResponse = await auth(
      request(app).put(`/transactions/${transactionId}`)
    ).send({ amount: "50" });
    expect(updateResponse.status).toBe(200);

    const deleteResponse = await auth(
      request(app).delete(`/transactions/${transactionId}`)
    );
    expect(deleteResponse.status).toBe(204);
  });

  it("stores a bare date at UTC midnight and normalizes an offset datetime to UTC", async () => {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

    const bare = await auth(request(app).post("/transactions")).send({
      name: "Bare",
      amount: "1",
      type: "expense",
      date: "2026-11-05"
    });
    expect(bare.status).toBe(201);
    expect(bare.body.transaction.date).toBe("2026-11-05T00:00:00.000Z");

    const offset = await auth(request(app).post("/transactions")).send({
      name: "Offset",
      amount: "1",
      type: "expense",
      date: "2026-11-05T14:30:00-06:00"
    });
    expect(offset.status).toBe(201);
    expect(offset.body.transaction.date).toBe("2026-11-05T20:30:00.000Z");

    const updated = await auth(request(app).put(`/transactions/${bare.body.transaction.id}`)).send({
      date: "2026-11-05T14:30:00-06:00"
    });
    expect(updated.status).toBe(200);
    expect(updated.body.transaction.date).toBe("2026-11-05T20:30:00.000Z");

    const untouched = await auth(request(app).put(`/transactions/${offset.body.transaction.id}`)).send({
      name: "Renamed"
    });
    expect(untouched.body.transaction.date).toBe("2026-11-05T20:30:00.000Z");
  });

  it("exposes only the linked import's transactionDate on an imported transaction", async () => {
    const { prisma } = await import("../../../db/prisma.js");
    const { token, user } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

    const category = await auth(request(app).post("/categories")).send({
      name: "Imported",
      type: "expense"
    });
    const imported = await prisma.providerImportedTransaction.create({
      data: {
        userId: user.id,
        provider: "syncfy",
        providerCredentialId: "cred-1",
        providerAccountId: "acct-1",
        providerTransactionId: `tx-${Date.now()}`,
        description: "Provider coffee",
        amount: -12.5,
        currency: "USD",
        transactionDate: new Date("2026-06-04T12:00:00.000Z"),
        rawData: { secret: "must-not-leak" }
      }
    });
    const importResponse = await auth(
      request(app).post(`/transactions/imported/${imported.id}/import`)
    ).send({ categoryId: category.body.category.id });
    expect(importResponse.status).toBe(201);

    const list = await auth(request(app).get("/transactions"));
    const [row] = list.body.data as { providerImportedTransaction: unknown; date: string }[];
    expect(row?.date).toBe("2026-06-04T12:00:00.000Z");
    expect(row?.providerImportedTransaction).toEqual({
      transactionDate: "2026-06-04T12:00:00.000Z"
    });
  });

  it("hides another user's imported-linked transaction from list and detail", async () => {
    const { prisma } = await import("../../../db/prisma.js");
    const owner = await createAuthedUser(app);
    const other = await createAuthedUser(app);
    const asOwner = (req: request.Test) => req.set("Authorization", `Bearer ${owner.token}`);
    const asOther = (req: request.Test) => req.set("Authorization", `Bearer ${other.token}`);

    const category = await asOwner(request(app).post("/categories")).send({
      name: "Imported",
      type: "expense"
    });
    const imported = await prisma.providerImportedTransaction.create({
      data: {
        userId: owner.user.id,
        provider: "syncfy",
        providerCredentialId: "cred-1",
        providerAccountId: "acct-1",
        providerTransactionId: `tx-${Date.now()}`,
        description: "Provider coffee",
        amount: -12.5,
        currency: "USD",
        transactionDate: new Date("2026-06-04T12:00:00.000Z"),
        rawData: { secret: "must-not-leak" }
      }
    });
    const importResponse = await asOwner(
      request(app).post(`/transactions/imported/${imported.id}/import`)
    ).send({ categoryId: category.body.category.id });
    expect(importResponse.status).toBe(201);
    const linked = await prisma.providerImportedTransaction.findUniqueOrThrow({
      where: { id: imported.id }
    });
    const transactionId = linked.transactionId as string;

    const ownerDetail = await asOwner(request(app).get(`/transactions/${transactionId}`));
    expect(ownerDetail.body.transaction.providerImportedTransaction).toEqual({
      transactionDate: "2026-06-04T12:00:00.000Z"
    });

    const otherList = await asOther(request(app).get("/transactions"));
    expect(otherList.body.data).toEqual([]);
    expect(JSON.stringify(otherList.body)).not.toContain("transactionDate");

    const otherDetail = await asOther(request(app).get(`/transactions/${transactionId}`));
    expect(otherDetail.status).toBe(404);
    expect(JSON.stringify(otherDetail.body)).not.toContain("transactionDate");
  });

  it("rejects a transfer with the same source and destination account", async () => {
    const { token } = await createAuthedUser(app);
    const accountResponse = await request(app)
      .post("/accounts")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Checking", type: "checking" });
    const accountId = accountResponse.body.account.id as string;

    const response = await request(app)
      .post("/transactions")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Bad transfer",
        amount: "10",
        type: "transfer",
        date: "2024-01-15",
        accountId,
        transferToAccountId: accountId
      });

    expect(response.status).toBe(400);
  });
});
