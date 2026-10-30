import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";
import { auditLog } from "../../utils/auditLog.js";

vi.mock("../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

let app: Express;
let prisma: typeof import("../../db/prisma.js").prisma;
interface Actor {
  jwt: string;
  userId: string;
  readKey: string;
  writeKey: string;
  readKeyId: string;
  writeKeyId: string;
  accountId: string;
  categoryId: string;
  transactionId: string;
}
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const readPaths = ["/v1/debts", "/v1/reports/summary", "/v1/reports/by-category",
  "/v1/reports/monthly-cashflow", "/v1/currencies", "/v1/currencies/rate?from=USD&to=USD",
  "/v1/notifications", "/v1/imported-transactions"];

async function mintKey(jwt: string, allowWrite: boolean) {
  const res = await request(app).post("/users/me/api-keys").set(bearer(jwt)).send({ name: "k", allowWrite });
  expect(res.status).toBe(201);
  return { key: res.body.key as string, id: res.body.apiKey.id as string };
}
function txBody(actor: Pick<Actor, "accountId" | "categoryId">, name = "Coffee") {
  return { name, amount: 5, type: "expense", date: "2024-01-15", accountId: actor.accountId, categoryId: actor.categoryId };
}
async function createActor(): Promise<Actor> {
  const { token: jwt, user } = await createAuthedUser(app);
  const account = await request(app).post("/accounts").set(bearer(jwt)).send({ name: "Checking", type: "checking" });
  const category = await request(app).post("/categories").set(bearer(jwt)).send({ name: "Food", type: "expense" });
  expect(account.status).toBe(201);
  expect(category.status).toBe(201);
  const partial = { accountId: account.body.account.id as string, categoryId: category.body.category.id as string };
  const tx = await request(app).post("/transactions").set(bearer(jwt)).send(txBody(partial, "Seed"));
  expect(tx.status).toBe(201);
  const read = await mintKey(jwt, false);
  const write = await mintKey(jwt, true);
  return { jwt, userId: user.id, ...partial, transactionId: tx.body.transaction.id as string,
    readKey: read.key, writeKey: write.key, readKeyId: read.id, writeKeyId: write.id };
}
async function snapshot() {
  return Promise.all([
    prisma.account.findMany({ orderBy: { id: "asc" } }),
    prisma.category.findMany({ orderBy: { id: "asc" } }),
    prisma.categoryUser.findMany({ orderBy: { id: "asc" } }),
    prisma.transaction.findMany({ orderBy: { id: "asc" } }),
    prisma.providerImportedTransaction.findMany({ orderBy: { id: "asc" } })
  ]);
}
async function write(actor: Actor, method: "post" | "put" | "delete", path: string, body: object, status: number, readOnly = false) {
  vi.mocked(auditLog).mockClear();
  const res = await request(app)[method](path).set(bearer(readOnly ? actor.readKey : actor.writeKey)).send(body);
  expect(res.status, `${method} ${path}: ${JSON.stringify(res.body)}`).toBe(status);
  const [, , resource, id, action] = path.split("/");
  const singular = resource === "accounts" ? "account" : resource === "categories" ? "category" : "transaction";
  const operation = action ?? (method === "delete" ? "delete" : method === "put" ? "update" : "create");
  expect(auditLog).toHaveBeenCalledTimes(1);
  expect(auditLog).toHaveBeenCalledWith({ userId: actor.userId, credentialKind: "apiKey",
    credentialId: readOnly ? actor.readKeyId : actor.writeKeyId,
    op: `${singular}.${operation}`, resourceId: id ?? res.body[singular]?.id ?? null, status });
  expect(JSON.stringify(vi.mocked(auditLog).mock.calls)).not.toContain(actor.readKey);
  expect(JSON.stringify(vi.mocked(auditLog).mock.calls)).not.toContain(actor.writeKey);
  return res;
}
async function seedTransaction(actor: Actor, name: string) {
  return prisma.transaction.create({ data: { userId: actor.userId, name, amount: 5, amountInPreferredCurrency: 5,
    type: "expense", date: new Date("2024-01-15"), accountId: actor.accountId, categoryId: actor.categoryId } });
}
function importedRow(actor: Actor, index: number) {
  return { userId: actor.userId, provider: "test", providerCredentialId: actor.userId, providerAccountId: actor.accountId,
    providerTransactionId: `${actor.userId}-${index}`, description: `Import ${index}`, amount: 1, currency: "USD",
    transactionDate: new Date("2024-01-15"), rawData: {} };
}

describe("/v1 CRUD integration", () => {
  let a: Actor;
  let b: Actor;
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    a = await createActor();
    b = await createActor();
  }, 180_000);
  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it.each(readPaths)("GET %s succeeds with either key, requires authentication and is not audited", async (path) => {
    vi.mocked(auditLog).mockClear();
    const before = await snapshot();
    for (const key of [a.readKey, a.writeKey]) {
      const res = await request(app).get(path).set(bearer(key));
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("application/json");
    }
    const missing = await request(app).get(path);
    expect(missing.status).toBe(401);
    expect(missing.body.message).toEqual(expect.any(String));
    expect(auditLog).not.toHaveBeenCalled();
    expect(await snapshot()).toEqual(before);
  });
  it.each(["summary", "by-category", "monthly-cashflow"])("validates %s report filters", async (report) => {
    const res = await request(app).get(`/v1/reports/${report}`).set(bearer(a.readKey)).query({ dateFrom: "x" });
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Validation failed");
  });

  describe.each(["accounts", "categories"] as const)("%s writes", (resource) => {
    const singular = resource === "accounts" ? "account" : "category";
    const body = { name: "Created", type: resource === "accounts" ? "checking" : "expense" };
    const idOf = (actor: Actor) => resource === "accounts" ? actor.accountId : actor.categoryId;
    const routes = [
      { method: "post", suffix: "", body },
      { method: "put", suffix: "/id", body: { name: "Changed" } },
      { method: "post", suffix: "/id/archive", body: {} },
      { method: "post", suffix: "/id/restore", body: {} }
    ] as const;
    it.each(routes)("$method $suffix requires a key and refuses read keys without mutations", async (route) => {
      const path = `/v1/${resource}${route.suffix.replace("id", idOf(a))}`;
      const before = await snapshot();
      const missing = await request(app)[route.method](path).send(route.body);
      expect(missing.status).toBe(401);
      expect(missing.body.message).toEqual(expect.any(String));
      await write(a, route.method, path, route.body, 403, true);
      expect(await snapshot()).toEqual(before);
    });
    it.each(routes.slice(1))("$method $suffix refuses another user's id", async (route) => {
      const before = await snapshot();
      await write(a, route.method, `/v1/${resource}${route.suffix.replace("id", idOf(b))}`, route.body, 404);
      expect(await snapshot()).toEqual(before);
    });
    it("creates, partially updates and archives/restores idempotently without changing transactions", async () => {
      const created = await write(a, "post", `/v1/${resource}`, body, 201);
      const id = created.body[singular].id as string;
      expect(id).toEqual(expect.any(String));
      if (resource === "accounts") {
        expect(await prisma.account.findUniqueOrThrow({ where: { id } })).toMatchObject({ userId: a.userId });
      } else {
        expect(await prisma.categoryUser.findUnique({ where: { categoryId_userId: { categoryId: id, userId: a.userId } } })).not.toBeNull();
      }
      const updated = await write(a, "put", `/v1/${resource}/${id}`, { name: "Renamed" }, 200);
      expect(updated.body[singular]).toMatchObject({ id, name: "Renamed", type: body.type });
      const before = await prisma.transaction.findMany({ orderBy: { id: "asc" } });
      for (const action of ["archive", "archive", "restore", "restore"] as const) {
        const res = await write(a, "post", `/v1/${resource}/${idOf(a)}/${action}`, {}, 200);
        expect(res.body[singular].isArchived).toBe(action === "archive");
        const record = resource === "accounts"
          ? await prisma.account.findUniqueOrThrow({ where: { id: idOf(a) } })
          : await prisma.category.findUniqueOrThrow({ where: { id: idOf(a) } });
        expect(record.isArchived).toBe(action === "archive");
        expect(await prisma.transaction.findMany({ orderBy: { id: "asc" } })).toEqual(before);
      }
    });
    it.each(["post", "put"] as const)("rejects invalid %s input and checks scope first", async (method) => {
      const path = `/v1/${resource}${method === "put" ? `/${idOf(a)}` : ""}`;
      const before = await snapshot();
      await write(a, method, path, { name: "Bad", type: "invalid" }, 400);
      await write(a, method, path, { name: "Bad", type: "invalid" }, 403, true);
      expect(await snapshot()).toEqual(before);
    });
  });

  it("does not mass-assign account ownership or archive state", async () => {
    const before = await prisma.account.findUniqueOrThrow({ where: { id: a.accountId } });
    vi.mocked(auditLog).mockClear();
    const res = await request(app).put(`/v1/accounts/${a.accountId}`).set(bearer(a.writeKey))
      .send({ name: "Safe rename", userId: b.userId, isArchived: true });
    expect([200, 400]).toContain(res.status);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "account.update", status: res.status, resourceId: a.accountId }));
    const after = await prisma.account.findUniqueOrThrow({ where: { id: a.accountId } });
    expect(after.userId).toBe(before.userId);
    expect(after.isArchived).toBe(before.isArchived);
    expect(after.archivedAt).toEqual(before.archivedAt);
  });
  it("denies unlisted imported-transaction routes with JSON 404 and leaves records intact", async () => {
    const imported = await prisma.providerImportedTransaction.create({ data: importedRow(a, 0) });
    const before = await snapshot();
    for (const [method, path] of [
      ["post", `/v1/imported-transactions/${imported.id}/merge`], ["delete", `/v1/imported-transactions/${imported.id}`]
    ] as const) {
      const res = await request(app)[method](path).set(bearer(a.writeKey)).send({ categoryId: a.categoryId, status: "ignored" });
      expect(res.status).toBe(404);
      expect(res.headers["content-type"]).toContain("application/json");
      expect(res.body.message).toEqual(expect.any(String));
      expect(await snapshot()).toEqual(before);
    }
  });
  it("caps user C's 250 imports at 100, preserves total and isolates owners", async () => {
    const c = await createActor();
    await prisma.providerImportedTransaction.createMany({ data: Array.from({ length: 250 }, (_, i) => importedRow(c, i)) });
    const res = await request(app).get("/v1/imported-transactions").set(bearer(c.readKey));
    expect(res.status).toBe(200);
    expect(res.body.importedTransactions).toHaveLength(100);
    expect(res.body.total).toBe(250);
    const ids = new Set((await prisma.providerImportedTransaction.findMany({ where: { userId: c.userId } })).map((row) => row.id));
    for (const row of res.body.importedTransactions as { id: string }[]) expect(ids.has(row.id)).toBe(true);
    const other = await request(app).get("/v1/imported-transactions").set(bearer(b.readKey));
    expect(other.status).toBe(200);
    expect(other.body.importedTransactions).toEqual([]);
    expect(other.body.total).toBe(0);
  });

  describe("account and category deletion (same semantics as the web DELETE routes)", () => {
    it("refuses a read key (403), another user's ids (404) and unauthenticated calls (401), changing nothing", async () => {
      const before = await snapshot();
      for (const kind of ["accounts", "categories"] as const) {
        const own = kind === "accounts" ? a.accountId : a.categoryId;
        const foreign = kind === "accounts" ? b.accountId : b.categoryId;
        await write(a, "delete", `/v1/${kind}/${own}`, {}, 403, true);
        await write(a, "delete", `/v1/${kind}/${foreign}`, {}, 404);
        expect((await request(app).delete(`/v1/${kind}/${own}`)).status).toBe(401);
      }
      expect(await snapshot()).toEqual(before);
    });

    it("deletes an account with 204 like the web route; its transactions survive unlinked and a transfer keeps the other leg", async () => {
      const c = await createActor();
      const second = await request(app).post("/accounts").set(bearer(c.jwt)).send({ name: "Second", type: "checking" });
      const secondId = second.body.account.id as string;
      const transfer = await prisma.transaction.create({ data: { userId: c.userId, name: "Move", amount: 10,
        amountInPreferredCurrency: 10, type: "transfer", date: new Date("2024-01-16"), accountId: c.accountId, transferToAccountId: secondId } });

      await write(c, "delete", `/v1/accounts/${c.accountId}`, {}, 204);
      expect(await prisma.account.count({ where: { id: c.accountId } })).toBe(0);
      expect(await prisma.transaction.findUniqueOrThrow({ where: { id: c.transactionId } })).toMatchObject({ accountId: null });
      expect(await prisma.transaction.findUniqueOrThrow({ where: { id: transfer.id } })).toMatchObject({ accountId: null, transferToAccountId: secondId });

      await write(c, "delete", `/v1/accounts/${secondId}`, {}, 204);
      expect(await prisma.transaction.findUniqueOrThrow({ where: { id: transfer.id } })).toMatchObject({ accountId: null, transferToAccountId: null });
      await write(c, "delete", `/v1/accounts/${c.accountId}`, {}, 404);
    });

    it("deletes a category with 204; its transactions survive uncategorized", async () => {
      const c = await createActor();
      await write(c, "delete", `/v1/categories/${c.categoryId}`, {}, 204);
      expect(await prisma.category.count({ where: { id: c.categoryId } })).toBe(0);
      expect(await prisma.categoryUser.count({ where: { categoryId: c.categoryId } })).toBe(0);
      expect(await prisma.transaction.findUniqueOrThrow({ where: { id: c.transactionId } })).toMatchObject({ categoryId: null });
      await write(c, "delete", `/v1/categories/${c.categoryId}`, {}, 404);
    });
  });

  describe("transaction deletion", () => {
    it("requires a key, refuses read keys and hides another user's transaction", async () => {
      const before = await snapshot();
      const missing = await request(app).delete(`/v1/transactions/${a.transactionId}`);
      expect(missing.status).toBe(401);
      expect(missing.body.message).toEqual(expect.any(String));
      await write(a, "delete", `/v1/transactions/${a.transactionId}`, {}, 403, true);
      await write(a, "delete", `/v1/transactions/${b.transactionId}`, {}, 404);
      expect(await snapshot()).toEqual(before);
    });
    it("deletes a plain transaction and related notifications, then returns 404", async () => {
      const tx = await seedTransaction(a, "Plain delete");
      const notification = await prisma.notification.create({ data: { userId: a.userId,
        type: "shared_expense_added", title: "Related", message: "Related", metadata: { transactionId: tx.id } } });
      const unrelated = await prisma.notification.create({ data: { userId: a.userId,
        type: "shared_expense_added", title: "Unrelated", message: "Unrelated", metadata: { transactionId: a.transactionId } } });
      const res = await write(a, "delete", `/v1/transactions/${tx.id}`, {}, 204);
      expect(res.text).toBe("");
      expect(await prisma.transaction.findUnique({ where: { id: tx.id } })).toBeNull();
      expect(await prisma.notification.findUnique({ where: { id: notification.id } })).toBeNull();
      expect(await prisma.notification.findUnique({ where: { id: unrelated.id } })).not.toBeNull();
      await write(a, "delete", `/v1/transactions/${tx.id}`, {}, 404);
    });
    it("removes only the transfer row and its effect on both account balances", async () => {
      const destination = await prisma.account.create({ data: { userId: a.userId, name: "Destination", type: "savings", initialBalance: 100 } });
      const balances = async () => {
        const res = await request(app).get("/v1/accounts").set(bearer(a.readKey));
        expect(res.status).toBe(200);
        return (res.body.accounts as { id: string; currentBalance: number }[])
          .filter((account) => [a.accountId, destination.id].includes(account.id))
          .map(({ id, currentBalance }) => ({ id, balance: currentBalance })).sort((x, y) => x.id.localeCompare(y.id));
      };
      const beforeBalances = await balances();
      const beforeAccounts = await prisma.account.findMany({ orderBy: { id: "asc" } });
      const beforeTransactions = await prisma.transaction.findMany({ orderBy: { id: "asc" } });
      const tx = await prisma.transaction.create({ data: { userId: a.userId, name: "Transfer", amount: 20,
        amountInPreferredCurrency: 20, type: "transfer", date: new Date("2024-01-15"),
        accountId: a.accountId, transferToAccountId: destination.id } });
      const during = await balances();
      expect(during.find((row) => row.id === a.accountId)!.balance).toBe(Number(beforeBalances.find((row) => row.id === a.accountId)!.balance) - 20);
      expect(during.find((row) => row.id === destination.id)!.balance).toBe(Number(beforeBalances.find((row) => row.id === destination.id)!.balance) + 20);
      await write(a, "delete", `/v1/transactions/${tx.id}`, {}, 204);
      expect(await balances()).toEqual(beforeBalances);
      expect(await prisma.account.findMany({ orderBy: { id: "asc" } })).toEqual(beforeAccounts);
      expect(await prisma.transaction.findMany({ orderBy: { id: "asc" } })).toEqual(beforeTransactions);
    });
    async function sharedFixture() {
      const tx = await seedTransaction(a, "Shared expense");
      const expense = await prisma.sharedExpense.create({ data: {
        transactionId: tx.id, ownerUserId: a.userId, title: "Shared", totalAmount: 5 } });
      const participant = await prisma.sharedExpenseParticipant.create({ data: {
        sharedExpenseId: expense.id, userId: b.userId, participantName: "B", shareAmount: 5 } });
      const settlement = await prisma.settlementRequest.create({ data: {
        sharedExpenseParticipantId: participant.id, debtorUserId: b.userId, creditorUserId: a.userId, amount: 5 } });
      return { tx, expense, participant, settlement };
    }
    it("cascades shared expense, participant, settlement request and their notifications", async () => {
      const { tx, expense, participant, settlement } = await sharedFixture();
      const notifications = await Promise.all([
        { transactionId: tx.id }, { sharedExpenseId: expense.id },
        { participantId: participant.id }, { settlementRequestId: settlement.id }
      ].map((metadata) => prisma.notification.create({ data: {
        userId: b.userId, type: "settlement_requested", title: "Shared", message: "Shared", metadata } })));
      await write(a, "delete", `/v1/transactions/${tx.id}`, {}, 204);
      expect(await prisma.transaction.findUnique({ where: { id: tx.id } })).toBeNull();
      expect(await prisma.sharedExpense.findUnique({ where: { id: expense.id } })).toBeNull();
      expect(await prisma.sharedExpenseParticipant.findUnique({ where: { id: participant.id } })).toBeNull();
      expect(await prisma.settlementRequest.findUnique({ where: { id: settlement.id } })).toBeNull();
      expect(await prisma.notification.count({ where: { id: { in: notifications.map((row) => row.id) } } })).toBe(0);
    });
    it.each(["debtorTransactionId", "creditorTransactionId"] as const)("clears %s on payment deletion and keeps the approved request", async (field) => {
      const { tx, expense, participant, settlement } = await sharedFixture();
      const debtorPayment = await seedTransaction(b, "Debtor payment");
      const creditorPayment = await seedTransaction(a, "Creditor payment");
      await prisma.settlementRequest.update({ where: { id: settlement.id }, data: {
        status: "approved", approvedAt: new Date(), debtorTransactionId: debtorPayment.id, creditorTransactionId: creditorPayment.id } });
      const isDebtor = field === "debtorTransactionId";
      const payment = isDebtor ? debtorPayment : creditorPayment;
      await write(isDebtor ? b : a, "delete", `/v1/transactions/${payment.id}`, {}, 204);
      expect(await prisma.transaction.findUnique({ where: { id: payment.id } })).toBeNull();
      expect(await prisma.settlementRequest.findUniqueOrThrow({ where: { id: settlement.id } })).toMatchObject({
        status: "approved", [field]: null,
        [isDebtor ? "creditorTransactionId" : "debtorTransactionId"]: isDebtor ? creditorPayment.id : debtorPayment.id });
      expect(await prisma.transaction.findUnique({ where: { id: tx.id } })).not.toBeNull();
      expect(await prisma.sharedExpense.findUnique({ where: { id: expense.id } })).not.toBeNull();
      expect(await prisma.sharedExpenseParticipant.findUnique({ where: { id: participant.id } })).not.toBeNull();
    });
  });
});
