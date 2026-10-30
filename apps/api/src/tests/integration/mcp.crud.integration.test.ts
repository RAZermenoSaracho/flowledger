import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test: needs Docker (see CLAUDE.local.md). Drives the new personal-CRUD MCP tools
// with the real SDK client and compares them with the /v1 REST routes over a testcontainers Postgres.
let app: Express;
let server: Server;
let baseUrl: string;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];

type AuthedUser = Awaited<ReturnType<typeof createAuthedUser>>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type McpResult = { isError?: boolean; structuredContent?: Json; content: { text: string }[] };

interface Actor {
  user: AuthedUser;
  readKey: string;
  writeKey: string;
  read: Client;
  write: Client;
  accountId: string;
  categoryId: string;
  transactionId: string;
}

async function mintKey(user: AuthedUser, allowWrite: boolean) {
  const response = await request(app)
    .post("/users/me/api-keys")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ name: "mcp-crud", allowWrite, lifetime: "1m" });
  return { key: response.body.key as string, id: response.body.apiKey.id as string };
}

async function connect(key: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } }
    })
  );
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  try {
    return (await client.callTool({ name, arguments: args })) as McpResult;
  } catch (error) {
    return { isError: true, content: [{ text: String(error) }] } as McpResult;
  }
}

async function createActor(): Promise<Actor> {
  const user = await createAuthedUser(app);
  const bearer = { Authorization: `Bearer ${user.token}` };
  const account = await request(app).post("/accounts").set(bearer).send({ name: "Checking", type: "checking" });
  const category = await request(app).post("/categories").set(bearer).send({ name: "Food", type: "expense" });
  const accountId = account.body.account.id as string;
  const categoryId = category.body.category.id as string;
  const tx = await request(app)
    .post("/transactions")
    .set(bearer)
    .send({ name: "Seed", amount: 5, type: "expense", date: "2024-01-15", accountId, categoryId });
  const readKey = (await mintKey(user, false)).key;
  const writeKey = (await mintKey(user, true)).key;
  return {
    user,
    readKey,
    writeKey,
    read: await connect(readKey),
    write: await connect(writeKey),
    accountId,
    categoryId,
    transactionId: tx.body.transaction.id as string
  };
}

const rest = (key: string) => ({ Authorization: `Bearer ${key}` });

const READ_TOOLS = [
  "get_exchange_rate",
  "get_profile",
  "get_report",
  "get_transaction",
  "get_transaction_summary",
  "list_accounts",
  "list_categories",
  "list_currencies",
  "list_debts",
  "list_groups",
  "list_imported_transactions",
  "list_notifications",
  "list_shared_expenses",
  "search_transactions",
  "search_users"
];

const WRITE_TOOLS = [
  "add_group_member",
  "create_account",
  "create_category",
  "create_group",
  "create_group_category",
  "create_shared_expense",
  "create_transaction",
  "delete_account",
  "delete_category",
  "delete_transaction",
  "get_exchange_rate",
  "get_profile",
  "get_report",
  "get_transaction",
  "get_transaction_summary",
  "ignore_imported_transactions",
  "import_imported_transactions",
  "list_accounts",
  "list_categories",
  "list_currencies",
  "list_debts",
  "list_groups",
  "list_imported_transactions",
  "list_notifications",
  "list_shared_expenses",
  "mark_notifications_read",
  "remove_group_member",
  "request_settlement",
  "search_transactions",
  "search_users",
  "set_account_archived",
  "set_category_archived",
  "set_group_archived",
  "unignore_imported_transactions",
  "update_account",
  "update_category",
  "update_group",
  "update_imported_transaction",
  "update_preferences",
  "update_transaction"
];

describe("MCP personal CRUD tools", () => {
  let a: Actor;
  let b: Actor;

  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    a = await createActor();
    b = await createActor();
  }, 180_000);

  afterAll(async () => {
    server?.close();
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  describe("tool lists", () => {
    it("exposes the read tools to a read key and every tool to a write key, with the spec annotations", async () => {
      const readTools = (await a.read.listTools()).tools;
      const writeTools = (await a.write.listTools()).tools;
      const names = readTools.map((t) => t.name);

      expect(names.sort()).toEqual(READ_TOOLS);
      expect(writeTools.map((t) => t.name).sort()).toEqual(WRITE_TOOLS);
      for (const write of ["create_account", "update_account", "set_account_archived", "create_category", "update_category", "set_category_archived", "delete_account", "delete_category", "delete_transaction"]) {
        expect(names).not.toContain(write);
        expect(writeTools.map((t) => t.name)).toContain(write);
      }
      for (const name of ["delete_account", "delete_category", "delete_transaction"]) {
        expect(writeTools.find((t) => t.name === name)!.annotations).toMatchObject({
          destructiveHint: true,
          idempotentHint: false
        });
      }
      expect(writeTools.find((t) => t.name === "delete_account")!.description).toMatch(/explicit user confirmation/);
      expect(writeTools.find((t) => t.name === "set_account_archived")!.annotations).toMatchObject({ idempotentHint: true });
      expect(readTools.find((t) => t.name === "list_debts")!.annotations).toMatchObject({ readOnlyHint: true });
    });
  });

  describe("read key cannot mutate", () => {
    it("refuses every write tool and changes nothing", async () => {
      const calls: [string, Record<string, unknown>][] = [
        ["create_account", { name: "Nope", type: "cash" }],
        ["update_account", { id: a.accountId, name: "Hacked" }],
        ["set_account_archived", { id: a.accountId, archived: true }],
        ["create_category", { name: "Nope", type: "expense" }],
        ["update_category", { id: a.categoryId, name: "Hacked" }],
        ["set_category_archived", { id: a.categoryId, archived: true }],
        ["delete_account", { id: a.accountId }],
        ["delete_category", { id: a.categoryId }],
        ["delete_transaction", { id: a.transactionId }]
      ];
      for (const [name, args] of calls) expect((await call(a.read, name, args)).isError).toBe(true);

      expect(await prisma.account.findUniqueOrThrow({ where: { id: a.accountId } })).toMatchObject({ name: "Checking", isArchived: false });
      expect((await prisma.category.findUniqueOrThrow({ where: { id: a.categoryId } })).name).toBe("Food");
      expect(await prisma.transaction.count({ where: { id: a.transactionId } })).toBe(1);
      expect(await prisma.account.count({ where: { userId: a.user.user.id, name: "Nope" } })).toBe(0);
    });
  });

  describe("account and category writes", () => {
    it("creates, updates, archives and restores an account; archive is idempotent and keeps transactions", async () => {
      const created = await call(a.write, "create_account", { name: "Savings", type: "savings" });
      const id = created.structuredContent!.account.id as string;
      expect((await prisma.account.findUniqueOrThrow({ where: { id } })).userId).toBe(a.user.user.id);

      const updated = await call(a.write, "update_account", { id, name: "Rainy day", userId: b.user.user.id, isArchived: true });
      expect(updated.structuredContent!.account).toMatchObject({ name: "Rainy day", isArchived: false });
      expect((await prisma.account.findUniqueOrThrow({ where: { id } })).userId).toBe(a.user.user.id);

      await call(a.write, "set_account_archived", { id: a.accountId, archived: true });
      await call(a.write, "set_account_archived", { id: a.accountId, archived: true });
      expect((await prisma.account.findUniqueOrThrow({ where: { id: a.accountId } })).isArchived).toBe(true);
      expect(await prisma.transaction.count({ where: { id: a.transactionId } })).toBe(1);

      await call(a.write, "set_account_archived", { id: a.accountId, archived: false });
      expect((await prisma.account.findUniqueOrThrow({ where: { id: a.accountId } })).isArchived).toBe(false);
    });

    it("creates, updates, archives and restores a category and rejects an invalid type", async () => {
      const created = await call(a.write, "create_category", { name: "Fun", type: "expense" });
      const id = created.structuredContent!.category.id as string;
      expect((await call(a.write, "update_category", { id, color: "#ff0000" })).structuredContent!.category.color).toBe("#ff0000");

      await call(a.write, "set_category_archived", { id, archived: true });
      expect((await prisma.category.findUniqueOrThrow({ where: { id } })).isArchived).toBe(true);
      await call(a.write, "set_category_archived", { id, archived: false });
      expect((await prisma.category.findUniqueOrThrow({ where: { id } })).isArchived).toBe(false);

      const before = await prisma.category.count();
      expect((await call(a.write, "create_category", { name: "Bad", type: "bogus" })).isError).toBe(true);
      expect(await prisma.category.count()).toBe(before);
    });

    it("refuses another user's ids as not found and leaves their data unchanged", async () => {
      for (const [name, args] of [
        ["update_account", { id: b.accountId, name: "Stolen" }],
        ["set_account_archived", { id: b.accountId, archived: true }],
        ["update_category", { id: b.categoryId, name: "Stolen" }],
        ["set_category_archived", { id: b.categoryId, archived: true }],
        ["delete_account", { id: b.accountId }],
        ["delete_category", { id: b.categoryId }],
        ["delete_transaction", { id: b.transactionId }]
      ] as const) {
        const result = await call(a.write, name, args);
        expect(result.isError).toBe(true);
        expect(result.content[0]!.text).toMatch(/not found/i);
      }

      expect(await prisma.account.findUniqueOrThrow({ where: { id: b.accountId } })).toMatchObject({ name: "Checking", isArchived: false });
      expect((await prisma.category.findUniqueOrThrow({ where: { id: b.categoryId } })).name).toBe("Food");
      expect(await prisma.transaction.count({ where: { id: b.transactionId } })).toBe(1);
    });
  });

  describe("delete_account and delete_category", () => {
    it("delete like the web routes (transactions survive unlinked) and match the REST not-found message", async () => {
      const c = await createActor();
      const accountDelete = await call(c.write, "delete_account", { id: c.accountId });
      expect(accountDelete.structuredContent).toEqual({ deleted: true, id: c.accountId });
      expect(await prisma.account.count({ where: { id: c.accountId } })).toBe(0);
      expect(await prisma.transaction.findUniqueOrThrow({ where: { id: c.transactionId } })).toMatchObject({ accountId: null });

      const categoryDelete = await call(c.write, "delete_category", { id: c.categoryId });
      expect(categoryDelete.structuredContent).toEqual({ deleted: true, id: c.categoryId });
      expect(await prisma.category.count({ where: { id: c.categoryId } })).toBe(0);
      expect(await prisma.transaction.findUniqueOrThrow({ where: { id: c.transactionId } })).toMatchObject({ categoryId: null });

      const rest404 = await request(app).delete(`/v1/accounts/${c.accountId}`).set(rest(c.writeKey));
      const mcp404 = await call(c.write, "delete_account", { id: c.accountId });
      expect(rest404.status).toBe(404);
      expect(mcp404.isError).toBe(true);
      expect(mcp404.content[0]!.text).toContain(rest404.body.message);
      const restCat404 = await request(app).delete(`/v1/categories/${c.categoryId}`).set(rest(c.writeKey));
      expect((await call(c.write, "delete_category", { id: c.categoryId })).content[0]!.text).toContain(restCat404.body.message);
    });
  });

  describe("delete_transaction", () => {
    it("deletes a plain transaction and removes its notifications; a second call is not found", async () => {
      const tx = await prisma.transaction.create({
        data: { userId: a.user.user.id, name: "Plain", amount: 1, type: "expense", date: new Date("2024-02-01"), amountInPreferredCurrency: 1 }
      });
      const notification = await prisma.notification.create({
        data: { userId: a.user.user.id, type: "shared_expense_added", title: "t", message: "m", metadata: { transactionId: tx.id } }
      });

      const first = await call(a.write, "delete_transaction", { id: tx.id });
      expect(first.structuredContent).toEqual({ deleted: true, id: tx.id });
      expect(await prisma.transaction.count({ where: { id: tx.id } })).toBe(0);
      expect(await prisma.notification.count({ where: { id: notification.id } })).toBe(0);
      expect((await call(a.write, "delete_transaction", { id: tx.id })).isError).toBe(true);
    });

    it("deletes a transfer as a single row", async () => {
      const second = await request(app)
        .post("/accounts")
        .set(rest(a.user.token))
        .send({ name: "Second", type: "checking" });
      const transfer = await call(a.write, "create_transaction", {
        name: "Move",
        amount: 10,
        type: "transfer",
        date: "2024-03-01",
        accountId: a.accountId,
        transferToAccountId: second.body.account.id
      });
      const id = transfer.structuredContent!.transaction.id as string;

      expect((await call(a.write, "delete_transaction", { id })).isError).toBeUndefined();
      expect(await prisma.transaction.count({ where: { id } })).toBe(0);
    });
  });

  describe("bounded lists", () => {
    it("returns 100 imported rows with total 250", async () => {
      const c = await createActor();
      await prisma.providerImportedTransaction.createMany({
        data: Array.from({ length: 250 }, (_, i) => ({
          userId: c.user.user.id,
          provider: "test",
          providerCredentialId: "cred",
          providerAccountId: "acc",
          providerTransactionId: `mcp-crud-${c.user.user.id}-${i}`,
          description: `Row ${i}`,
          amount: -1,
          currency: "USD",
          transactionDate: new Date("2024-01-01"),
          rawData: {}
        }))
      });

      const result = await call(c.read, "list_imported_transactions");
      expect(result.structuredContent!.importedTransactions).toHaveLength(100);
      expect(result.structuredContent!.total).toBe(250);
    });
  });

  describe("REST parity and isolation", () => {
    it.each([
      ["list_debts", {}, "/v1/debts"],
      ["list_notifications", {}, "/v1/notifications"],
      ["list_imported_transactions", {}, "/v1/imported-transactions"],
      ["get_report", { type: "summary" }, "/v1/reports/summary"],
      ["get_report", { type: "by_category" }, "/v1/reports/by-category"],
      ["get_report", { type: "monthly_cashflow" }, "/v1/reports/monthly-cashflow"],
      ["get_exchange_rate", { from: "USD", to: "USD" }, "/v1/currencies/rate?from=USD&to=USD"]
    ])("%s %j returns the same data as GET %s", async (tool, args, path) => {
      const mcp = await call(a.read, tool, args);
      const http = await request(app).get(path).set(rest(a.readKey));

      expect(mcp.isError).toBeUndefined();
      expect(http.status).toBe(200);
      const { unreadCount: _unreadCount, ...mcpData } = mcp.structuredContent!;
      expect(tool === "list_notifications" ? mcpData : mcp.structuredContent).toEqual(http.body);
    });

    it("lists no row belonging only to another user", async () => {
      await prisma.notification.create({
        data: { userId: b.user.user.id, type: "shared_expense_added", title: "B only", message: "secret-b" }
      });
      const notifications = await call(a.read, "list_notifications");
      expect(JSON.stringify(notifications.structuredContent)).not.toContain("secret-b");
    });

    it("produces the same DB state through MCP and REST for create, archive and delete", async () => {
      const viaMcp = (await call(a.write, "create_account", { name: "Parity", type: "cash" })).structuredContent!.account.id as string;
      const viaRest = (await request(app).post("/v1/accounts").set(rest(a.writeKey)).send({ name: "Parity", type: "cash" })).body.account.id as string;
      for (const id of [viaMcp, viaRest]) {
        expect(await prisma.account.findUniqueOrThrow({ where: { id } })).toMatchObject({ userId: a.user.user.id, name: "Parity", type: "cash", currency: "USD" });
      }

      await call(a.write, "set_account_archived", { id: viaMcp, archived: true });
      await request(app).post(`/v1/accounts/${viaRest}/archive`).set(rest(a.writeKey));
      for (const id of [viaMcp, viaRest]) expect((await prisma.account.findUniqueOrThrow({ where: { id } })).isArchived).toBe(true);

      const txs = await Promise.all(
        [0, 1].map(() =>
          prisma.transaction.create({
            data: { userId: a.user.user.id, name: "Del", amount: 1, type: "expense", date: new Date("2024-04-01"), amountInPreferredCurrency: 1 }
          })
        )
      );
      await call(a.write, "delete_transaction", { id: txs[0]!.id });
      expect((await request(app).delete(`/v1/transactions/${txs[1]!.id}`).set(rest(a.writeKey))).status).toBe(204);
      expect(await prisma.transaction.count({ where: { id: { in: txs.map((t) => t.id) } } })).toBe(0);
    });

    it("refuses a foreign id on both surfaces", async () => {
      expect((await call(a.write, "update_account", { id: b.accountId, name: "x" })).isError).toBe(true);
      expect((await request(app).put(`/v1/accounts/${b.accountId}`).set(rest(a.writeKey)).send({ name: "x" })).status).toBe(404);
    });
  });

  describe("audit", () => {
    it("emits one audit line per write, 404 included, without the token", async () => {
      const spy = vi.spyOn(process.stdout, "write");
      await call(a.write, "create_category", { name: "Audited", type: "income" });
      await call(a.write, "delete_transaction", { id: b.transactionId });
      const lines = spy.mock.calls.map(([chunk]) => String(chunk)).filter((line) => line.includes('"audit":true'));
      spy.mockRestore();

      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain("mcp.create_category");
      expect(lines[0]).toContain('"status":201');
      expect(lines[1]).toContain("mcp.delete_transaction");
      expect(lines[1]).toContain('"status":404');
      expect(lines[1]).toContain(b.transactionId);
      expect(lines.join("")).not.toContain(a.writeKey);
    });
  });
});
