import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { auditLog } from "../../utils/auditLog.js";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test: needs Docker (see CLAUDE.local.md). Drives the group, shared-expense and
// settlement /v1 routes with users A (group admin), B (member) and C (stranger) over a real Postgres.
vi.mock("../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

let app: Express;
let prisma: typeof import("../../db/prisma.js").prisma;

interface Actor {
  jwt: string;
  userId: string;
  accountId: string;
  readKey: string;
  writeKey: string;
  readKeyId: string;
  writeKeyId: string;
}
type Method = "get" | "post" | "put" | "delete";

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function mintKey(jwt: string, allowWrite: boolean) {
  const res = await request(app).post("/users/me/api-keys").set(bearer(jwt)).send({ name: "k", allowWrite });
  expect(res.status).toBe(201);
  return { key: res.body.key as string, id: res.body.apiKey.id as string };
}

async function createActor(): Promise<Actor> {
  const { token: jwt, user } = await createAuthedUser(app);
  const account = await request(app).post("/accounts").set(bearer(jwt)).send({ name: "Checking", type: "checking" });
  expect(account.status).toBe(201);
  const read = await mintKey(jwt, false);
  const write = await mintKey(jwt, true);
  return {
    jwt,
    userId: user.id,
    accountId: account.body.account.id as string,
    readKey: read.key,
    writeKey: write.key,
    readKeyId: read.id,
    writeKeyId: write.id
  };
}

/** Calls a /v1 route with the actor's write (or read) key, asserts the status and, for writes, exactly one audit line. */
async function call(actor: Actor, method: Method, path: string, body: object | undefined, status: number, op?: string, readOnly = false) {
  vi.mocked(auditLog).mockClear();
  const res = await request(app)[method](path).set(bearer(readOnly ? actor.readKey : actor.writeKey)).send(body);
  expect(res.status, `${method} ${path}: ${JSON.stringify(res.body)}`).toBe(status);
  if (op) {
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: actor.userId,
        credentialKind: "apiKey",
        credentialId: readOnly ? actor.readKeyId : actor.writeKeyId,
        op,
        status
      })
    );
  }
  return res;
}

const snapshot = () =>
  Promise.all([
    prisma.group.findMany({ orderBy: { id: "asc" } }),
    prisma.groupMember.findMany({ orderBy: { id: "asc" } }),
    prisma.sharedExpense.findMany({ orderBy: { id: "asc" } }),
    prisma.sharedExpenseParticipant.findMany({ orderBy: { id: "asc" } }),
    prisma.settlementRequest.findMany({ orderBy: { id: "asc" } }),
    prisma.transaction.findMany({ orderBy: { id: "asc" } }),
    prisma.notification.findMany({ orderBy: { id: "asc" } })
  ]);

describe("/v1 group, shared-expense and settlement routes", () => {
  let a: Actor;
  let b: Actor;
  let c: Actor;
  let groupId: string;
  let expenseCategoryId: string;
  let incomeCategoryId: string;
  let groupTransactionId: string;
  let sharedExpenseId: string;

  async function addMember(admin: Actor, id: string, userId: string) {
    const res = await request(app).post(`/groups/${id}/members`).set(bearer(admin.jwt)).send({ userId });
    expect(res.status).toBe(201);
  }

  async function groupTransaction(amount = 100) {
    const res = await request(app).post("/transactions").set(bearer(a.jwt)).send({
      name: "Dinner", amount, type: "expense", date: "2024-02-01", accountId: a.accountId, categoryId: expenseCategoryId, groupId
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.transaction.id as string;
  }

  async function shareWithB(amount = 100, share = 40) {
    const transactionId = await groupTransaction(amount);
    const res = await call(
      a, "post", "/v1/shared-expenses",
      { transactionId, title: "Dinner", participants: [{ userId: b.userId, participantName: "B", shareAmount: share }] },
      201, "sharedExpense.create"
    );
    const debt = await prisma.sharedExpenseParticipant.findFirstOrThrow({
      where: { sharedExpenseId: res.body.sharedExpense.id, userId: b.userId }
    });
    return { debtId: debt.id };
  }

  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    a = await createActor();
    b = await createActor();
    c = await createActor();
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  describe("group lifecycle", () => {
    it("creates a group as admin, audits the created id and rejects invalid bodies", async () => {
      await call(a, "post", "/v1/groups", { name: "" }, 400, "group.create");
      const res = await call(a, "post", "/v1/groups", { name: "Trip", description: "Beach" }, 201, "group.create");
      groupId = res.body.group.id;
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ resourceId: groupId }));
      expect(await prisma.groupMember.findFirstOrThrow({ where: { groupId, userId: a.userId } })).toMatchObject({ role: "admin" });
    });

    it("sets up B as member and shared group categories through the internal routes", async () => {
      await addMember(a, groupId, b.userId);
      for (const [name, type] of [["Shared food", "expense"], ["Shared income", "income"]] as const) {
        const res = await request(app).post(`/groups/${groupId}/categories`).set(bearer(a.jwt)).send({ name, type });
        expect(res.status).toBe(201);
        if (type === "expense") expenseCategoryId = res.body.category.id;
        else incomeCategoryId = res.body.category.id;
      }
    });

    it("lists and gets groups only for members", async () => {
      for (const actor of [a, b]) {
        const list = await request(app).get("/v1/groups").set(bearer(actor.readKey));
        expect(list.status).toBe(200);
        expect(list.body.groups.map((g: { id: string }) => g.id)).toContain(groupId);
        const one = await request(app).get(`/v1/groups/${groupId}`).set(bearer(actor.readKey));
        expect(one.status).toBe(200);
        expect(one.body.group.members).toHaveLength(2);
      }
      const list = await request(app).get("/v1/groups").set(bearer(c.readKey));
      expect(list.body.groups).toEqual([]);
      expect((await request(app).get(`/v1/groups/${groupId}`).set(bearer(c.readKey))).status).toBe(404);
    });

    it("lets only the admin update, archive and restore; repeats are idempotent", async () => {
      const before = await snapshot();
      for (const actor of [b, c]) {
        await call(actor, "put", `/v1/groups/${groupId}`, { name: "Hijack" }, 404, "group.update");
        await call(actor, "post", `/v1/groups/${groupId}/archive`, undefined, 404, "group.archive");
        await call(actor, "post", `/v1/groups/${groupId}/restore`, undefined, 404, "group.restore");
      }
      expect(await snapshot()).toEqual(before);

      await call(a, "put", `/v1/groups/${groupId}`, {}, 400, "group.update");
      const updated = await call(a, "put", `/v1/groups/${groupId}`, { name: "Trip 2", role: "x" }, 200, "group.update");
      expect(updated.body.group.name).toBe("Trip 2");
      for (const action of ["archive", "archive", "restore", "restore"] as const) {
        const res = await call(a, "post", `/v1/groups/${groupId}/${action}`, undefined, 200, `group.${action}`);
        expect(res.body.group.isArchived).toBe(action === "archive");
      }
    });
  });

  describe("member removal", () => {
    it("refuses non-admin removal of others, including removing the admin", async () => {
      const before = await snapshot();
      await call(b, "delete", `/v1/groups/${groupId}/members/${a.userId}`, undefined, 404, "group.remove_member");
      await call(c, "delete", `/v1/groups/${groupId}/members/${b.userId}`, undefined, 404, "group.remove_member");
      expect(await snapshot()).toEqual(before);
    });

    it("lets an admin remove a member and revokes their category access", async () => {
      await call(a, "delete", `/v1/groups/${groupId}/members/${b.userId}`, undefined, 204, "group.remove_member");
      expect(await prisma.groupMember.count({ where: { groupId, userId: b.userId } })).toBe(0);
      expect(await prisma.categoryUser.count({ where: { userId: b.userId, category: { groupId } } })).toBe(0);
      expect((await request(app).get(`/v1/groups/${groupId}`).set(bearer(b.readKey))).status).toBe(404);
    });

    it("lets a member leave on their own", async () => {
      await addMember(a, groupId, b.userId);
      await call(b, "delete", `/v1/groups/${groupId}/members/${b.userId}`, undefined, 204, "group.remove_member");
      expect(await prisma.groupMember.count({ where: { groupId, userId: b.userId } })).toBe(0);
      expect(await prisma.categoryUser.count({ where: { userId: b.userId, category: { groupId } } })).toBe(0);
      await addMember(a, groupId, b.userId);
    });
  });

  describe("shared expenses", () => {
    it("creates one on a group transaction, notifies the participant and enforces the group-transaction rules", async () => {
      const personal = await prisma.transaction.create({
        data: { userId: a.userId, name: "Solo", amount: 50, amountInPreferredCurrency: 50, type: "expense", date: new Date("2024-02-01"), accountId: a.accountId }
      });
      const bTx = await prisma.transaction.create({
        data: { userId: b.userId, name: "Mine", amount: 50, amountInPreferredCurrency: 50, type: "expense", date: new Date("2024-02-01"), accountId: b.accountId, groupId }
      });
      groupTransactionId = await groupTransaction(100);
      const participant = (userId: string, shareAmount = 100) => ({ userId, participantName: "P", shareAmount });
      const body = (transactionId: string, participants: object[]) => ({ transactionId, title: "Split", participants });

      const before = await snapshot();
      await call(a, "post", "/v1/shared-expenses", body(personal.id, [participant(b.userId, 50)]), 400, "sharedExpense.create");
      await call(a, "post", "/v1/shared-expenses", body(personal.id, [participant(c.userId, 50)]), 400, "sharedExpense.create");
      await call(a, "post", "/v1/shared-expenses", body(bTx.id, [participant(a.userId, 50)]), 404, "sharedExpense.create");
      await call(a, "post", "/v1/shared-expenses", body("missing", [participant(b.userId)]), 404, "sharedExpense.create");
      await call(a, "post", "/v1/shared-expenses", body(groupTransactionId, [participant(c.userId)]), 400, "sharedExpense.create");
      await call(a, "post", "/v1/shared-expenses", body(groupTransactionId, [participant(a.userId)]), 400, "sharedExpense.create");
      await call(a, "post", "/v1/shared-expenses", body(groupTransactionId, [participant(b.userId, 150)]), 400, "sharedExpense.create");
      await call(a, "post", "/v1/shared-expenses", { transactionId: groupTransactionId }, 400, "sharedExpense.create");
      await call(a, "post", "/v1/shared-expenses", body(groupTransactionId, [participant(b.userId)]), 403, undefined, true);
      expect(await snapshot()).toEqual(before);

      const created = await call(a, "post", "/v1/shared-expenses", body(groupTransactionId, [participant(b.userId, 100)]), 201, "sharedExpense.create");
      sharedExpenseId = created.body.sharedExpense.id;
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ resourceId: sharedExpenseId }));
      expect(await prisma.notification.count({ where: { userId: b.userId, type: "shared_expense_added" } })).toBe(1);
      expect(await prisma.notification.count({ where: { userId: c.userId } })).toBe(0);
    });

    it("lists and gets only for owner or participant", async () => {
      for (const actor of [a, b]) {
        const list = await request(app).get("/v1/shared-expenses").set(bearer(actor.readKey));
        expect(list.status).toBe(200);
        expect(list.body.total).toBe(1);
        expect(list.body.sharedExpenses[0].id).toBe(sharedExpenseId);
        expect((await request(app).get(`/v1/shared-expenses/${sharedExpenseId}`).set(bearer(actor.readKey))).status).toBe(200);
      }
      const list = await request(app).get("/v1/shared-expenses").set(bearer(c.readKey));
      expect(list.body).toEqual({ sharedExpenses: [], total: 0 });
      expect((await request(app).get(`/v1/shared-expenses/${sharedExpenseId}`).set(bearer(c.readKey))).status).toBe(404);
    });

    it("caps the list at 100 rows with the untruncated total", async () => {
      const d = await createActor();
      const ids = Array.from({ length: 250 }, (_, i) => `cap-${d.userId}-${i}`);
      await prisma.transaction.createMany({
        data: ids.map((id, i) => ({ id, userId: d.userId, name: `T${i}`, amount: 1, amountInPreferredCurrency: 1, type: "expense" as const, date: new Date("2024-02-01"), accountId: d.accountId }))
      });
      await prisma.sharedExpense.createMany({
        data: ids.map((id, i) => ({ transactionId: id, title: `S${i}`, totalAmount: 1, ownerUserId: d.userId }))
      });
      const res = await request(app).get("/v1/shared-expenses").set(bearer(d.readKey));
      expect(res.status).toBe(200);
      expect(res.body.sharedExpenses).toHaveLength(100);
      expect(res.body.total).toBe(250);
    });
  });

  describe("settlements", () => {
    it("lets only the debtor request, once, and only the creditor approve", async () => {
      const { debtId } = await shareWithB(100, 40);
      const settle = { amount: 40, accountId: b.accountId, categoryId: expenseCategoryId, note: "paid" };

      const before = await snapshot();
      await call(a, "post", `/v1/debts/${debtId}/settlement-request`, { ...settle, accountId: a.accountId }, 404, "settlement.request");
      await call(c, "post", `/v1/debts/${debtId}/settlement-request`, settle, 404, "settlement.request");
      await call(b, "post", `/v1/debts/${debtId}/settlement-request`, settle, 403, undefined, true);
      await call(b, "post", `/v1/debts/${debtId}/settlement-request`, { ...settle, amount: 0 }, 400, "settlement.request");
      expect(await snapshot()).toEqual(before);

      const created = await call(b, "post", `/v1/debts/${debtId}/settlement-request`, settle, 201, "settlement.request");
      const requestId = created.body.settlementRequest.id as string;
      expect(await prisma.notification.count({ where: { userId: a.userId, type: "settlement_requested" } })).toBeGreaterThan(0);
      await call(b, "post", `/v1/debts/${debtId}/settlement-request`, settle, 400, "settlement.request");

      const approval = { accountId: a.accountId, categoryId: incomeCategoryId };
      const pending = await snapshot();
      await call(b, "post", `/v1/settlements/${requestId}/approve`, approval, 404, "settlement.approve");
      await call(c, "post", `/v1/settlements/${requestId}/approve`, approval, 404, "settlement.approve");
      await call(a, "post", `/v1/settlements/${requestId}/approve`, approval, 403, undefined, true);
      await call(a, "post", `/v1/settlements/${requestId}/approve`, {}, 400, "settlement.approve");
      expect(await snapshot()).toEqual(pending);

      const aTxBefore = await prisma.transaction.count({ where: { userId: a.userId } });
      const bTxBefore = await prisma.transaction.count({ where: { userId: b.userId } });
      await call(a, "post", `/v1/settlements/${requestId}/approve`, approval, 200, "settlement.approve");
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ resourceId: requestId }));
      expect(await prisma.transaction.count({ where: { userId: a.userId } })).toBe(aTxBefore + 1);
      expect(await prisma.transaction.count({ where: { userId: b.userId } })).toBe(bTxBefore + 1);
      expect(await prisma.settlementRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({ status: "approved" });
      expect(Number((await prisma.sharedExpenseParticipant.findUniqueOrThrow({ where: { id: debtId } })).paidAmount)).toBe(40);

      await call(a, "post", `/v1/settlements/${requestId}/approve`, approval, 404, "settlement.approve");
      await call(a, "post", `/v1/settlements/${requestId}/reject`, undefined, 404, "settlement.reject");
    });

    it("lets the creditor reject a pending request without creating transactions", async () => {
      const { debtId } = await shareWithB(100, 25);
      const created = await call(b, "post", `/v1/debts/${debtId}/settlement-request`, { amount: 25, accountId: b.accountId, categoryId: expenseCategoryId }, 201, "settlement.request");
      const requestId = created.body.settlementRequest.id as string;

      const before = await snapshot();
      await call(b, "post", `/v1/settlements/${requestId}/reject`, undefined, 404, "settlement.reject");
      await call(a, "post", `/v1/settlements/${requestId}/reject`, undefined, 403, undefined, true);
      expect(await snapshot()).toEqual(before);

      const res = await call(a, "post", `/v1/settlements/${requestId}/reject`, undefined, 200, "settlement.reject");
      expect(res.body.settlementRequest.status).toBe("rejected");
      expect(await prisma.transaction.count()).toBe(before[5].length);
      await call(a, "post", `/v1/settlements/${requestId}/reject`, undefined, 404, "settlement.reject");
    });
  });

  describe("user search, member add and group categories", () => {
    let gid: string;
    let target: { userId: string; email: string };

    beforeAll(async () => {
      const g = await request(app).post("/groups").set(bearer(a.jwt)).send({ name: "Adds" });
      gid = g.body.group.id;
      await addMember(a, gid, b.userId);
      const { user } = await createAuthedUser(app, { name: "Zed Searchable" });
      target = { userId: user.id, email: user.email };
    });

    it("searches users with a 3-character minimum, a 10-row cap, public fields only and a read key", async () => {
      const get = (q: string, extra = "", key = a.readKey) => request(app).get(`/v1/users/search?q=${q}${extra}`).set(bearer(key));
      expect((await get("ze")).status).toBe(400);
      expect((await get("zed", "&limit=11")).status).toBe(400);
      const hit = await get("Zed%20Search");
      expect(hit.status).toBe(200);
      expect(hit.body.users).toEqual([{ id: target.userId, name: "Zed Searchable", email: target.email }]);
      expect((await get("a.com", "", a.writeKey)).status).toBe(200);
      // Registers 11 users (bcrypt cost 12 each), which exceeds the default 5 s timeout when suites run in parallel.
      for (let i = 0; i < 11; i++) await createAuthedUser(app, { name: `Capuser ${i}` });
      const capped = await get("capuser");
      expect(capped.body.users).toHaveLength(10);
      expect(capped.body.users.map((u: { id: string }) => u.id)).not.toContain(a.userId);
      const self = await get(encodeURIComponent("test-user"));
      expect(self.body.users.map((u: { id: string }) => u.id)).not.toContain(a.userId);
    }, 20_000);

    it("lets only an admin add a member, refusing members, strangers and read keys", async () => {
      const before = await snapshot();
      await call(b, "post", `/v1/groups/${gid}/members`, { userId: target.userId }, 404, "group.add_member");
      await call(c, "post", `/v1/groups/${gid}/members`, { userId: target.userId }, 404, "group.add_member");
      await call(a, "post", `/v1/groups/${gid}/members`, { userId: target.userId }, 403, "group.add_member", true);
      await call(a, "post", `/v1/groups/${gid}/members`, {}, 400, "group.add_member");
      expect(await snapshot()).toEqual(before);

      await call(a, "post", `/v1/groups/${gid}/members`, { userId: target.userId }, 201, "group.add_member");
      expect(await prisma.groupMember.findFirstOrThrow({ where: { groupId: gid, userId: target.userId } })).toMatchObject({ role: "member" });
      expect(await prisma.notification.count({ where: { userId: target.userId, type: "group_member_added" } })).toBe(1);
      await call(a, "post", `/v1/groups/${gid}/members`, { userId: target.userId }, 409, "group.add_member");
    });

    it("lets only an admin create a group category visible to all members", async () => {
      const body = { name: "Rent", type: "expense" };
      const before = await prisma.category.count();
      await call(b, "post", `/v1/groups/${gid}/categories`, body, 404, "group.create_category");
      await call(c, "post", `/v1/groups/${gid}/categories`, body, 404, "group.create_category");
      await call(a, "post", `/v1/groups/${gid}/categories`, body, 403, "group.create_category", true);
      await call(a, "post", `/v1/groups/${gid}/categories`, { name: "" }, 400, "group.create_category");
      expect(await prisma.category.count()).toBe(before);

      const res = await call(a, "post", `/v1/groups/${gid}/categories`, body, 201, "group.create_category");
      const users = await prisma.categoryUser.findMany({ where: { categoryId: res.body.category.id } });
      expect(users.map((u) => u.userId).sort()).toEqual([a.userId, b.userId, target.userId].sort());
    });
  });

  describe("access control and excluded routes", () => {
    const routes: [Method, string][] = [
      ["get", "/v1/groups"], ["get", "/v1/groups/x"], ["get", "/v1/shared-expenses"], ["get", "/v1/shared-expenses/x"],
      ["post", "/v1/groups"], ["put", "/v1/groups/x"], ["post", "/v1/groups/x/archive"], ["post", "/v1/groups/x/restore"],
      ["delete", "/v1/groups/x/members/y"], ["post", "/v1/shared-expenses"], ["post", "/v1/debts/x/settlement-request"],
      ["post", "/v1/settlements/x/approve"], ["post", "/v1/settlements/x/reject"],
      ["get", "/v1/users/search?q=abc"], ["post", "/v1/groups/x/members"], ["post", "/v1/groups/x/categories"]
    ];
    it.each(routes)("%s %s requires a key", async (method, path) => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(401);
    });

    it("returns JSON 404 for unrouted operations and leaves data untouched", async () => {
      const before = await snapshot();
      for (const [method, path] of [
        ["delete", `/v1/groups/${groupId}`],
        ["put", `/v1/shared-expenses/${sharedExpenseId}`], ["delete", `/v1/shared-expenses/${sharedExpenseId}`],
        ["post", "/v1/debts/x/settle"], ["post", "/v1/debts/settlement-requests/batch"], ["post", "/v1/settlements/approve/batch"]
      ] as const) {
        const res = await request(app)[method](path).set(bearer(a.writeKey)).send({ userId: c.userId });
        expect(res.status, `${method} ${path}`).toBe(404);
        expect(res.headers["content-type"]).toContain("application/json");
      }
      expect(await snapshot()).toEqual(before);
    });

    it("never logs key material in audit lines", () => {
      const logged = JSON.stringify(vi.mocked(auditLog).mock.calls);
      expect(logged).not.toContain(a.writeKey);
      expect(logged).not.toContain(a.readKey);
    });
  });
});
