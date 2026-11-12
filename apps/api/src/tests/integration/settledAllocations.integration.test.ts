import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Express } from "express";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { loopbackOrigin } from "../helpers/loopback.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test (needs Docker, see docs/TESTING.md): settled allocations are immutable, extra amounts
// come in as additional allocation lines with their own consent, accept/reject can target one allocation (web, /v1
// and MCP), and concurrent settlement requests/approvals cannot overpay.
let app: Express;
let server: Server;
let baseUrl: string;
let prisma: typeof import("../../db/prisma.js").prisma;

type Actor = Awaited<ReturnType<typeof createAuthedUser>> & { accountId: string; expenseCategoryId: string; incomeCategoryId: string };
const as = (u: { token: string }, req: request.Test) => req.set("Authorization", `Bearer ${u.token}`);
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function actor(): Promise<Actor> {
  const base = await createAuthedUser(app);
  const account = await as(base, request(app).post("/accounts")).send({ name: "Cash", type: "cash" });
  const expense = await as(base, request(app).post("/categories")).send({ name: "Expenses", type: "expense" });
  const income = await as(base, request(app).post("/categories")).send({ name: "Income", type: "income" });
  return { ...base, accountId: account.body.account.id, expenseCategoryId: expense.body.category.id, incomeCategoryId: income.body.category.id };
}

async function mintWriteKey(user: Actor) {
  const res = await request(app).post("/users/me/api-keys").set(bearer(user.token)).send({ name: "k", allowWrite: true, lifetime: "1m" });
  return res.body.key as string;
}

const putSharing = (owner: Actor, transactionId: string, participants: object[]) =>
  as(owner, request(app).put(`/transactions/${transactionId}`)).send({ sharedExpense: { enabled: true, participants } });

const rows = (sharedExpenseId: string, userId: string) =>
  prisma.sharedExpenseParticipant.findMany({ where: { sharedExpenseId, userId }, orderBy: { createdAt: "asc" } });

const requestSettlement = (user: Actor, debtId: string, amount: number) =>
  as(user, request(app).post(`/debts/${debtId}/settlement-request`)).send({
    amount: String(amount),
    accountId: user.accountId,
    categoryId: user.expenseCategoryId
  });

const approve = (owner: Actor, requestId: string) =>
  as(owner, request(app).post(`/settlements/${requestId}/approve`)).send({
    accountId: owner.accountId,
    categoryId: owner.incomeCategoryId
  });

describe("settled allocations and additional allocation lines", () => {
  let owner: Actor;
  let ana: Actor;
  let carlos: Actor;
  let transactionId: string;
  let sharedExpenseId: string;
  let anaLine1: string;
  let carlosLine: string;

  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    server = app.listen(0);
    baseUrl = loopbackOrigin(server);
    owner = await actor();
    ana = await actor();
    carlos = await actor();
  }, 180_000);

  afterAll(async () => {
    server?.close();
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it("lets Ana accept and fully settle her 1200 allocation", async () => {
    const created = await as(owner, request(app).post("/transactions")).send({
      name: "Trip",
      amount: "3000",
      type: "expense",
      date: "2024-01-15",
      accountId: owner.accountId,
      categoryId: owner.expenseCategoryId
    });
    expect(created.status).toBe(201);
    transactionId = created.body.transaction.id;

    const shared = await putSharing(owner, transactionId, [
      { userId: ana.user.id, share: 1200 },
      { userId: carlos.user.id, share: 800 }
    ]);
    expect(shared.status).toBe(200);
    sharedExpenseId = (await prisma.sharedExpense.findUniqueOrThrow({ where: { transactionId } })).id;
    anaLine1 = (await rows(sharedExpenseId, ana.user.id))[0]!.id;
    carlosLine = (await rows(sharedExpenseId, carlos.user.id))[0]!.id;

    for (const user of [ana, carlos]) {
      expect((await as(user, request(app).post(`/shared-expenses/${sharedExpenseId}/accept`))).status).toBe(200);
    }
    const settlement = await requestSettlement(ana, anaLine1, 1200);
    expect(settlement.status).toBe(201);
    expect((await approve(owner, settlement.body.settlementRequest.id)).status).toBe(200);
    expect(await rows(sharedExpenseId, ana.user.id)).toMatchObject([{ acceptance: "accepted", status: "paid" }]);
  });

  it("refuses to edit or remove the settled allocation but lets Carlos's share change", async () => {
    const edit = await putSharing(owner, transactionId, [
      { id: anaLine1, userId: ana.user.id, share: 1300 },
      { id: carlosLine, userId: carlos.user.id, share: 800 }
    ]);
    expect(edit.status).toBe(400);
    expect(edit.body.message ?? JSON.stringify(edit.body)).toContain("fully settled");

    const removal = await putSharing(owner, transactionId, [{ id: carlosLine, userId: carlos.user.id, share: 800 }]);
    expect(removal.status).toBe(400);

    const carlosEdit = await putSharing(owner, transactionId, [
      { id: anaLine1, userId: ana.user.id, share: 1200 },
      { id: carlosLine, userId: carlos.user.id, share: 700 }
    ]);
    expect(carlosEdit.status).toBe(200);
    expect((await rows(sharedExpenseId, carlos.user.id))[0]).toMatchObject({ acceptance: "accepted" });
    expect(Number((await rows(sharedExpenseId, ana.user.id))[0]!.shareAmount)).toBe(1200);
  });

  it("adds an additional line for Ana as proposed, and she rejects only that line through /v1", async () => {
    const withoutId = await putSharing(owner, transactionId, [
      { userId: ana.user.id, share: 1200 },
      { id: carlosLine, userId: carlos.user.id, share: 700 }
    ]);
    expect(withoutId.status).toBe(200);
    expect(await rows(sharedExpenseId, ana.user.id)).toHaveLength(1);

    const added = await putSharing(owner, transactionId, [
      { id: anaLine1, userId: ana.user.id, share: 1200 },
      { id: carlosLine, userId: carlos.user.id, share: 700 },
      { userId: ana.user.id, share: 300 }
    ]);
    expect(added.status).toBe(200);
    const [, line2] = await rows(sharedExpenseId, ana.user.id);
    expect(line2).toMatchObject({ acceptance: "proposed", status: "pending" });

    const ambiguous = await putSharing(owner, transactionId, [
      { userId: ana.user.id, share: 1200 },
      { id: carlosLine, userId: carlos.user.id, share: 700 }
    ]);
    expect(ambiguous.status).toBe(400);

    const key = await mintWriteKey(ana);
    const rejected = await request(app)
      .post(`/v1/shared-expenses/${sharedExpenseId}/reject`)
      .set(bearer(key))
      .send({ participantId: line2!.id });
    expect(rejected.status).toBe(200);
    expect(await rows(sharedExpenseId, ana.user.id)).toMatchObject([
      { id: anaLine1, acceptance: "accepted", status: "paid" },
      { id: line2!.id, acceptance: "rejected" }
    ]);
    const debts = await as(ana, request(app).get("/debts"));
    expect(debts.body.iOwe.filter((d: { outstandingAmount: number }) => d.outstandingAmount > 0)).toHaveLength(0);
  });

  it("re-adds the line after removing the rejected one and counts only 300 once Ana accepts through MCP", async () => {
    const removed = await putSharing(owner, transactionId, [
      { id: anaLine1, userId: ana.user.id, share: 1200 },
      { id: carlosLine, userId: carlos.user.id, share: 700 }
    ]);
    expect(removed.status).toBe(200);
    const readded = await putSharing(owner, transactionId, [
      { id: anaLine1, userId: ana.user.id, share: 1200 },
      { id: carlosLine, userId: carlos.user.id, share: 700 },
      { userId: ana.user.id, share: 300 }
    ]);
    expect(readded.status).toBe(200);
    const [, line2] = await rows(sharedExpenseId, ana.user.id);
    expect(line2).toMatchObject({ acceptance: "proposed" });

    const client = new Client({ name: "test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers: bearer(await mintWriteKey(ana)) } })
    );
    const mismatch = await client.callTool({ name: "accept_shared_expense", arguments: { id: sharedExpenseId, participantId: anaLine1 } });
    expect(mismatch.isError).toBe(true);
    const accepted = await client.callTool({ name: "accept_shared_expense", arguments: { id: sharedExpenseId, participantId: line2!.id } });
    expect(accepted.isError).toBeFalsy();
    await client.close();

    const debts = await as(ana, request(app).get("/debts"));
    const outstanding = debts.body.iOwe.map((d: { outstandingAmount: number }) => d.outstandingAmount);
    expect(outstanding.filter((amount: number) => amount > 0)).toEqual([300]);
  });

  it("refuses a settlement request or direct settle on the settled line", async () => {
    expect((await requestSettlement(ana, anaLine1, 10)).status).toBe(400);
    expect((await as(owner, request(app).post(`/debts/${anaLine1}/settle`)).send({})).status).toBe(400);
  });

  it("allows exactly one of two concurrent settlement requests and one of two concurrent approvals", async () => {
    const results = await Promise.all([requestSettlement(carlos, carlosLine, 100), requestSettlement(carlos, carlosLine, 100)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await prisma.settlementRequest.count({ where: { sharedExpenseParticipantId: carlosLine } })).toBe(1);

    const requestId = results.find((r) => r.status === 201)!.body.settlementRequest.id as string;
    const approvals = await Promise.all([approve(owner, requestId), approve(owner, requestId)]);
    expect(approvals.filter((r) => r.status === 200)).toHaveLength(1);
    expect(approvals.filter((r) => r.status !== 200).every((r) => [404, 409].includes(r.status))).toBe(true);
    expect(Number((await prisma.sharedExpenseParticipant.findUniqueOrThrow({ where: { id: carlosLine } })).paidAmount)).toBe(100);
  });
});
