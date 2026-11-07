import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signGoogleState } from "../../modules/auth/providers/google/utils/googleState.js";
import { registerWithSession } from "../helpers/sessionCookies.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module isolation suite: needs Docker (see docs/TESTING.md). User A owns every record; user B (and C) are strangers.
// New user-data mounts in app.ts must add rows here.
let app: Express;
let prisma: typeof import("../../db/prisma.js").prisma;

type Method = "get" | "post" | "put" | "patch" | "delete";
type Call = { method: Method; path: string; body?: object; query?: object };
type Actor = { token: string; userId: string };

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const send = (token: string | undefined, { method, path, body, query }: Call) => {
  const req = request(app)[method](path);
  if (token) req.set(bearer(token));
  return req.query(query ?? {}).send(body);
};
const anyOwnerWhere = { or: [{ field: "amount", op: ">=", value: 0 }, { field: "amount", op: "<", value: 0 }] };
const dsql = (where: object) => ({ query: JSON.stringify({ where }) });

const ctx = {} as {
  a: Actor;
  b: Actor;
  c: Actor;
  accountId: string;
  categoryId: string;
  transactionId: string;
  importedId: string;
  notificationId: string;
  apiKeyId: string;
  grantId: string;
};

async function actor(): Promise<Actor> {
  const s = await registerWithSession(app);
  return { token: s.token, userId: s.userId };
}

async function post(who: Actor, path: string, body: object) {
  const res = await request(app).post(path).set(bearer(who.token)).send(body);
  expect(res.status, `${path}: ${JSON.stringify(res.body)}`).toBeLessThan(300);
  return res.body;
}

async function seedTransaction(who: Actor, accountId: string, categoryId: string, extra: object = {}) {
  const body = await post(who, "/transactions", {
    name: "Dinner", amount: 100, type: "expense", date: "2024-02-01", accountId, categoryId, notes: "private note", ...extra
  });
  return body.transaction as { id: string; sharedExpense?: { id: string } };
}

async function seedOwnerData(who: Actor) {
  const accountId = (await post(who, "/accounts", { name: "Checking", type: "checking" })).account.id as string;
  const categoryId = (await post(who, "/categories", { name: "Food", type: "expense" })).category.id as string;
  return { accountId, categoryId };
}

describe("financial data isolation", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));

    ctx.a = await actor();
    ctx.b = await actor();
    ctx.c = await actor();
    const { accountId, categoryId } = await seedOwnerData(ctx.a);
    ctx.accountId = accountId;
    ctx.categoryId = categoryId;
    ctx.transactionId = (await seedTransaction(ctx.a, accountId, categoryId)).id;
    ctx.importedId = (
      await prisma.providerImportedTransaction.create({
        data: {
          userId: ctx.a.userId, provider: "syncfy", providerCredentialId: "cred-a", providerAccountId: "acc-a",
          providerTransactionId: "tx-a", description: "Imported A", amount: 12, currency: "USD",
          transactionDate: new Date("2024-02-01"), rawData: {}
        }
      })
    ).id;
    ctx.notificationId = (
      await prisma.notification.create({
        data: { userId: ctx.a.userId, type: "shared_expense_added", title: "t", message: "m" }
      })
    ).id;
    ctx.apiKeyId = (await post(ctx.a, "/users/me/api-keys", { name: "k" })).apiKey.id;
    ctx.grantId = (
      await prisma.oAuthGrant.create({
        data: {
          userId: ctx.a.userId, clientId: "c", clientName: "Client", redirectUri: "https://example.com/cb",
          scopes: ["read"], codeChallenge: "x", codeHash: "hash-a", codeExpiresAt: new Date(Date.now() + 60_000)
        }
      })
    ).id;
  }, 180_000);

  afterAll(async () => {
    await stopTestDatabase();
  });

  describe("anonymous requests", () => {
    const protectedCalls: [string, Method, string][] = [
      ["/users", "get", "/users/me"],
      ["/users", "get", "/users/search?q=abc"],
      ["/users/me/api-keys", "get", "/users/me/api-keys"],
      ["/users/me/api-keys", "post", "/users/me/api-keys"],
      ["/users/me/oauth-grants", "get", "/users/me/oauth-grants"],
      ["/oauth/authorize", "get", "/oauth/authorize/context"],
      ["/accounts", "get", "/accounts"],
      ["/categories", "get", "/categories"],
      ["/groups", "get", "/groups"],
      ["/notifications", "get", "/notifications"],
      ["/providers", "get", "/providers/connectors"],
      ["/debts", "get", "/debts"],
      ["/settlements", "post", "/settlements/x/reject"],
      ["/transactions", "get", "/transactions"],
      ["/shared-expenses", "get", "/shared-expenses"],
      ["/reports", "get", "/reports/summary"],
      ["/v1", "get", "/v1/accounts"],
      ["/mcp", "post", "/mcp"]
    ];
    const credentials: [string, () => string | undefined][] = [
      ["no credential", () => undefined],
      ["a signed Google state token", () => signGoogleState({ nonce: "n", redirect: "/", keepLoggedIn: true })],
      ["a garbage bearer token", () => "not-a-token"]
    ];

    it.each(protectedCalls.flatMap(([mount, method, path]) => credentials.map(([label, token]) => [mount, method, path, label, token] as const)))(
      "%s: %s %s with %s is 401",
      async (_mount, method, path, _label, token) => {
        const res = await send(token(), { method, path });
        expect(res.status).toBe(401);
      }
    );
  });

  describe("cross-user access", () => {
    it.each<[string, (c: typeof ctx) => Call]>([
      ["read account (list)", () => ({ method: "get", path: "/accounts" })],
      ["read transaction", (c) => ({ method: "get", path: `/transactions/${c.transactionId}` })],
      ["update transaction", (c) => ({ method: "put", path: `/transactions/${c.transactionId}`, body: { name: "hijacked" } })],
      ["delete transaction", (c) => ({ method: "delete", path: `/transactions/${c.transactionId}` })],
      ["update account", (c) => ({ method: "put", path: `/accounts/${c.accountId}`, body: { name: "hijacked" } })],
      ["archive account", (c) => ({ method: "post", path: `/accounts/${c.accountId}/archive` })],
      ["delete account", (c) => ({ method: "delete", path: `/accounts/${c.accountId}` })],
      ["update category", (c) => ({ method: "put", path: `/categories/${c.categoryId}`, body: { name: "hijacked" } })],
      ["archive category", (c) => ({ method: "post", path: `/categories/${c.categoryId}/archive` })],
      ["delete category", (c) => ({ method: "delete", path: `/categories/${c.categoryId}` })],
      ["update imported", (c) => ({ method: "patch", path: `/transactions/imported/${c.importedId}`, body: { categoryId: c.categoryId } })],
      ["ignore imported", (c) => ({ method: "post", path: `/transactions/imported/${c.importedId}/ignore` })],
      ["import imported", (c) => ({ method: "post", path: `/transactions/imported/${c.importedId}/import`, body: { categoryId: c.categoryId } })],
      ["mark notification read", (c) => ({ method: "patch", path: `/notifications/${c.notificationId}/read` })],
      ["revoke API key", (c) => ({ method: "delete", path: `/users/me/api-keys/${c.apiKeyId}` })],
      ["revoke OAuth grant", (c) => ({ method: "delete", path: `/users/me/oauth-grants/${c.grantId}` })]
    ])("%s as another user is 404 and A's data is unchanged", async (_name, build) => {
      const call = build(ctx);
      const isListRead = call.method === "get" && call.path === "/accounts";
      const res = await send(ctx.b.token, call);

      if (isListRead) {
        expect(res.status).toBe(200);
        expect(res.body.accounts).toEqual([]);
      } else {
        expect(res.status, JSON.stringify(res.body)).toBe(404);
      }
      await expectOwnerDataUntouched();
    });

    async function expectOwnerDataUntouched() {
      expect(await prisma.transaction.findUniqueOrThrow({ where: { id: ctx.transactionId } })).toMatchObject({ name: "Dinner", userId: ctx.a.userId });
      expect(await prisma.account.findUniqueOrThrow({ where: { id: ctx.accountId } })).toMatchObject({ name: "Checking", archivedAt: null });
      expect(await prisma.category.findUniqueOrThrow({ where: { id: ctx.categoryId } })).toMatchObject({ name: "Food", archivedAt: null });
      expect(await prisma.providerImportedTransaction.findUniqueOrThrow({ where: { id: ctx.importedId } })).toMatchObject({
        status: "pending", categoryId: null, transactionId: null
      });
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: ctx.notificationId } })).readAt).toBeNull();
      expect((await prisma.apiKey.findUniqueOrThrow({ where: { id: ctx.apiKeyId } })).revokedAt).toBeNull();
      expect((await prisma.oAuthGrant.findUniqueOrThrow({ where: { id: ctx.grantId } })).revokedAt).toBeNull();
    }

    it("B's list reads never contain A's records", async () => {
      for (const path of ["/accounts", "/categories", "/notifications", "/users/me/api-keys", "/users/me/oauth-grants"]) {
        const res = await send(ctx.b.token, { method: "get", path });
        expect(res.status).toBe(200);
        expect(JSON.stringify(res.body), path).not.toContain(ctx.a.userId);
        expect(JSON.stringify(res.body), path).not.toContain(ctx.accountId);
      }
    });

    describe("imported-transaction batch operations", () => {
      it.each(["batch-import", "batch-ignore", "batch-unignore"])("%s with A's ids changes nothing", async (action) => {
        const res = await send(ctx.b.token, {
          method: "post",
          path: `/transactions/imported/${action}`,
          body: { selection: { mode: "ids", ids: [ctx.importedId] }, ...(action === "batch-import" ? { categoryId: ctx.categoryId } : {}) }
        });
        expect(res.status, JSON.stringify(res.body)).toBeLessThan(500);
        expect(res.body.ignoredCount ?? res.body.unignoredCount ?? 0).toBe(0);
        await expectOwnerDataUntouched();
      });

      it.each(["batch-import", "batch-ignore", "batch-unignore"])("%s in filtered mode matching every owner changes nothing", async (action) => {
        const res = await send(ctx.b.token, {
          method: "post",
          path: `/transactions/imported/${action}`,
          body: {
            selection: { mode: "filtered", where: { or: [{ field: "status", op: "=", value: "pending" }, { field: "status", op: "!=", value: "pending" }] } },
            ...(action === "batch-import" ? { categoryId: ctx.categoryId } : {})
          }
        });
        expect(res.status, JSON.stringify(res.body)).toBeLessThan(500);
        expect(res.body.ignoredCount ?? res.body.unignoredCount ?? 0).toBe(0);
        await expectOwnerDataUntouched();
      });

      it("A's own batch-ignore still works, so the zero above is isolation and not a broken route", async () => {
        const res = await send(ctx.a.token, {
          method: "post",
          path: "/transactions/imported/batch-ignore",
          body: { selection: { mode: "ids", ids: [ctx.importedId] } }
        });
        expect(res.body.ignoredCount).toBe(1);
        await send(ctx.a.token, { method: "post", path: "/transactions/imported/batch-unignore", body: { selection: { mode: "ids", ids: [ctx.importedId] } } });
      });
    });

    describe("filter expressions cannot widen scope", () => {
      it("a top-level `or` on /transactions returns only the caller's rows", async () => {
        const bAccount = await seedOwnerData(ctx.b);
        const own = await seedTransaction(ctx.b, bAccount.accountId, bAccount.categoryId, { name: "B only", amount: 55 });
        const res = await send(ctx.b.token, { method: "get", path: "/transactions", query: dsql(anyOwnerWhere) });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.data.map((t: { id: string }) => t.id)).toEqual([own.id]);

        const summary = await send(ctx.b.token, { method: "get", path: "/transactions/summary", query: dsql(anyOwnerWhere) });
        expect(summary.status).toBe(200);
        expect(summary.body).toMatchObject({ income: 0, expenses: 55 });
      });

      it("a top-level `or` on /transactions/imported returns only the caller's rows", async () => {
        const where = { or: [{ field: "status", op: "=", value: "pending" }, { field: "status", op: "!=", value: "pending" }] };
        const own = await prisma.providerImportedTransaction.create({
          data: {
            userId: ctx.b.userId, provider: "syncfy", providerCredentialId: "cred-b", providerAccountId: "acc-b",
            providerTransactionId: "tx-b", description: "Imported B", amount: 7, currency: "USD",
            transactionDate: new Date("2024-02-02"), rawData: {}
          }
        });
        const res = await send(ctx.b.token, { method: "get", path: "/transactions/imported", query: dsql(where) });
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect(res.body.importedTransactions.map((t: { id: string }) => t.id)).toEqual([own.id]);
        expect(res.body.total).toBe(1);
      });
    });

    describe("reports", () => {
      it.each(["summary", "by-category", "monthly-cashflow"])("/reports/%s for B and an empty user never include A's category", async (report) => {
        const filters = { dateFrom: "2024-01-01", dateTo: "2024-12-31" };
        const fetchReport = (who: Actor) => send(who.token, { method: "get", path: `/reports/${report}`, query: filters });
        const [a, b, empty] = await Promise.all([fetchReport(ctx.a), fetchReport(ctx.b), fetchReport(ctx.c)]);
        expect(a.status).toBe(200);
        expect(JSON.stringify(a.body)).toContain(report === "by-category" ? ctx.categoryId : "100");
        for (const other of [b, empty]) {
          expect(other.status).toBe(200);
          expect(JSON.stringify(other.body)).not.toContain(ctx.categoryId);
        }
        if (report === "summary") {
          expect(b.body.summary).toMatchObject({ reportExpenses: 55, reportIncome: 0 });
          expect(empty.body.summary).toMatchObject({ reportExpenses: 0, reportIncome: 0 });
        }
      });
    });
  });

  describe("role enforcement", () => {
    let owner: Actor;
    let stranger: Actor;
    let participant: Actor;

    async function sharedExpenseWith(who: Actor, transactionType: "expense" | "income") {
      const { accountId, categoryId } = await seedOwnerData(owner);
      const tx = await seedTransaction(owner, accountId, categoryId, {
        type: transactionType,
        sharedExpense: { title: "Split", participants: [{ userId: who.userId, participantName: "P", shareAmount: 40 }] }
      });
      const debt = await prisma.sharedExpenseParticipant.findFirstOrThrow({ where: { sharedExpenseId: tx.sharedExpense!.id } });
      return { accountId, tx, sharedExpenseId: tx.sharedExpense!.id, debtId: debt.id };
    }

    beforeAll(async () => {
      [owner, participant, stranger] = [await actor(), await actor(), await actor()];
    });

    it.each<["expense" | "income", "creditor" | "debtor"]>([
      ["expense", "creditor"],
      ["income", "creditor"]
    ])("%s debt: only the creditor can settle directly", async (type) => {
      const { debtId } = await sharedExpenseWith(participant, type);
      const [creditor, debtor] = type === "expense" ? [owner, participant] : [participant, owner];

      for (const denied of [debtor, stranger]) {
        const res = await send(denied.token, { method: "post", path: `/debts/${debtId}/settle`, body: {} });
        expect(res.status).toBe(404);
        expect(await prisma.sharedExpenseParticipant.findUniqueOrThrow({ where: { id: debtId } })).toMatchObject({ status: "pending" });
      }

      const ok = await send(creditor.token, { method: "post", path: `/debts/${debtId}/settle`, body: {} });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(await prisma.sharedExpenseParticipant.findUniqueOrThrow({ where: { id: debtId } })).toMatchObject({ status: "paid" });
    });

    it("a debtor cannot approve or reject their own settlement request", async () => {
      const { debtId, accountId } = await sharedExpenseWith(participant, "expense");
      const pAccount = await seedOwnerData(participant);
      const created = await post(participant, `/debts/${debtId}/settlement-request`, {
        amount: 10, accountId: pAccount.accountId, categoryId: pAccount.categoryId
      });
      const requestId = created.settlementRequest.id as string;

      const approve = await send(participant.token, {
        method: "post", path: `/settlements/${requestId}/approve`, body: { accountId: pAccount.accountId, categoryId: pAccount.categoryId }
      });
      const reject = await send(participant.token, { method: "post", path: `/settlements/${requestId}/reject` });
      expect([approve.status, reject.status]).toEqual([404, 404]);
      expect(await prisma.settlementRequest.findUniqueOrThrow({ where: { id: requestId } })).toMatchObject({ status: "pending" });
      expect(accountId).toBeTruthy();
    });

    it("a participant sees the shared transaction without account or notes; the owner sees everything; a stranger gets 404", async () => {
      const { sharedExpenseId, tx, accountId } = await sharedExpenseWith(participant, "expense");

      const asParticipant = await send(participant.token, { method: "get", path: `/shared-expenses/${sharedExpenseId}` });
      expect(asParticipant.status).toBe(200);
      expect(asParticipant.body.sharedExpense.transaction).toMatchObject({ name: "Dinner" });
      expect(asParticipant.body.sharedExpense.transaction).not.toHaveProperty("accountId");
      expect(asParticipant.body.sharedExpense.transaction).not.toHaveProperty("notes");

      const listed = await send(participant.token, { method: "get", path: "/shared-expenses" });
      const row = listed.body.sharedExpenses.find((s: { id: string }) => s.id === sharedExpenseId);
      expect(row.transaction).not.toHaveProperty("accountId");
      expect(row.transaction).not.toHaveProperty("notes");

      const asOwner = await send(owner.token, { method: "get", path: `/shared-expenses/${sharedExpenseId}` });
      expect(asOwner.body.sharedExpense.transaction).toMatchObject({ id: tx.id, accountId, notes: "private note" });

      const asStranger = await send(stranger.token, { method: "get", path: `/shared-expenses/${sharedExpenseId}` });
      expect(asStranger.status).toBe(404);

      const ownerTransaction = await send(participant.token, { method: "get", path: `/transactions/${tx.id}` });
      expect(ownerTransaction.status).toBe(404);
    });

    it("a group member cannot run admin actions; the admin can", async () => {
      const group = (await post(owner, "/groups", { name: "Trip" })).group as { id: string };
      await post(owner, `/groups/${group.id}/members`, { userId: participant.userId });

      const adminActions: Call[] = [
        { method: "put", path: `/groups/${group.id}`, body: { name: "hijacked" } },
        { method: "post", path: `/groups/${group.id}/members`, body: { userId: stranger.userId } },
        { method: "post", path: `/groups/${group.id}/categories`, body: { name: "Extra", type: "expense" } },
        { method: "post", path: `/groups/${group.id}/archive` },
        { method: "delete", path: `/groups/${group.id}/members/${owner.userId}` },
        { method: "delete", path: `/groups/${group.id}` }
      ];
      for (const call of adminActions) {
        const res = await send(participant.token, call);
        expect(res.status, `${call.method} ${call.path} ${JSON.stringify(res.body)}`).toBe(404);
      }
      expect(await prisma.group.findUniqueOrThrow({ where: { id: group.id } })).toMatchObject({ name: "Trip", archivedAt: null });
      expect(await prisma.groupMember.count({ where: { groupId: group.id } })).toBe(2);

      const strangerRead = await send(stranger.token, { method: "get", path: `/groups/${group.id}` });
      const missingRead = await send(stranger.token, { method: "get", path: "/groups/does-not-exist" });
      expect(strangerRead.body).toEqual(missingRead.body);
      expect(strangerRead.status).toBe(400);

      const ok = await send(owner.token, adminActions[0]!);
      expect(ok.status).toBe(200);
    });

    it("a read-only API key gets 403 on /v1 writes and nothing changes", async () => {
      const { accountId, categoryId } = await seedOwnerData(owner);
      const tx = await seedTransaction(owner, accountId, categoryId);
      const { key } = await post(owner, "/users/me/api-keys", { name: "ro", allowWrite: false });

      const read = await send(key, { method: "get", path: `/v1/transactions/${tx.id}` });
      expect(read.status).toBe(200);

      const writes: Call[] = [
        { method: "put", path: `/v1/transactions/${tx.id}`, body: { name: "hijacked" } },
        { method: "delete", path: `/v1/transactions/${tx.id}` },
        { method: "put", path: `/v1/accounts/${accountId}`, body: { name: "hijacked" } },
        { method: "delete", path: `/v1/accounts/${accountId}` },
        { method: "delete", path: `/v1/categories/${categoryId}` },
        { method: "post", path: "/v1/transactions", body: { name: "new", amount: 1, type: "expense", date: "2024-01-01", accountId, categoryId } }
      ];
      const before = await prisma.transaction.count({ where: { userId: owner.userId } });
      for (const call of writes) {
        const res = await send(key, call);
        expect(res.status, `${call.method} ${call.path}`).toBe(403);
      }
      expect(await prisma.transaction.count({ where: { userId: owner.userId } })).toBe(before);
      expect(await prisma.transaction.findUniqueOrThrow({ where: { id: tx.id } })).toMatchObject({ name: "Dinner" });
      expect(await prisma.account.findUniqueOrThrow({ where: { id: accountId } })).toMatchObject({ name: "Checking" });
    });

    it("an API key of one user cannot read another user's transaction over /v1", async () => {
      const { accountId, categoryId } = await seedOwnerData(owner);
      const tx = await seedTransaction(owner, accountId, categoryId);
      const { key } = await post(stranger, "/users/me/api-keys", { name: "other", allowWrite: true });
      const res = await send(key, { method: "get", path: `/v1/transactions/${tx.id}` });
      expect(res.status).toBe(404);
      const del = await send(key, { method: "delete", path: `/v1/transactions/${tx.id}` });
      expect(del.status).toBe(404);
      expect(await prisma.transaction.findUnique({ where: { id: tx.id } })).not.toBeNull();
    });
  });
});
