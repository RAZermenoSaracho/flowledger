import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";
import { auditLog } from "../../utils/auditLog.js";

vi.mock("../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

// Cross-module integration test (needs Docker, see CLAUDE.local.md): imported-transaction review, notification
// state and profile preferences over REST (/v1) and MCP against a testcontainers Postgres.
let app: Express;
let server: Server;
let baseUrl: string;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type McpResult = { isError?: boolean; structuredContent?: Json; content: { text: string }[] };
interface Actor {
  jwt: string;
  userId: string;
  readKey: string;
  writeKey: string;
  writeKeyId: string;
  read: Client;
  write: Client;
  categoryId: string;
  incomeCategoryId: string;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function mintKey(jwt: string, allowWrite: boolean) {
  const res = await request(app).post("/users/me/api-keys").set(bearer(jwt)).send({ name: "k", allowWrite });
  expect(res.status).toBe(201);
  return { key: res.body.key as string, id: res.body.apiKey.id as string };
}
async function connect(key: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers: bearer(key) } })
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
  const { token: jwt, user } = await createAuthedUser(app);
  const category = await request(app).post("/categories").set(bearer(jwt)).send({ name: "Food", type: "expense" });
  const income = await request(app).post("/categories").set(bearer(jwt)).send({ name: "Pay", type: "income" });
  const readKey = await mintKey(jwt, false);
  const writeKey = await mintKey(jwt, true);
  return {
    jwt,
    userId: user.id,
    readKey: readKey.key,
    writeKey: writeKey.key,
    writeKeyId: writeKey.id,
    read: await connect(readKey.key),
    write: await connect(writeKey.key),
    categoryId: category.body.category.id as string,
    incomeCategoryId: income.body.category.id as string
  };
}
let seq = 0;
function seedImported(actor: Actor, overrides: Record<string, unknown> = {}) {
  seq += 1;
  return prisma.providerImportedTransaction.create({
    data: {
      userId: actor.userId,
      provider: "test",
      providerCredentialId: "cred",
      providerAccountId: "acc",
      providerTransactionId: `${actor.userId}-${seq}`,
      description: `Import ${seq}`,
      amount: -5,
      currency: "USD",
      transactionDate: new Date("2024-01-15"),
      rawData: {},
      ...overrides
    }
  });
}
const seedNotification = (actor: Actor, readAt: Date | null = null) =>
  prisma.notification.create({
    data: { userId: actor.userId, type: "provider_transactions_pending", title: "t", message: "m", readAt }
  });
const status = (id: string) => prisma.providerImportedTransaction.findUniqueOrThrow({ where: { id } }).then((r) => r.status);

describe("personal review, notifications and profile (REST + MCP)", () => {
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

  describe("imported-transaction review over REST", () => {
    it("PATCH sets and clears the category, audited, and 400s a type mismatch or non-pending row", async () => {
      const row = await seedImported(a);
      vi.mocked(auditLog).mockClear();
      const ok = await request(app).patch(`/v1/imported-transactions/${row.id}`).set(bearer(a.writeKey)).send({ categoryId: a.categoryId });
      expect(ok.status).toBe(200);
      expect(ok.body.importedTransaction.categoryId).toBe(a.categoryId);
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "imported.update", resourceId: row.id, status: 200, credentialId: a.writeKeyId }));

      expect((await request(app).patch(`/v1/imported-transactions/${row.id}`).set(bearer(a.writeKey)).send({ categoryId: a.incomeCategoryId })).status).toBe(400);
      expect((await request(app).patch(`/v1/imported-transactions/${row.id}`).set(bearer(a.writeKey)).send({ categoryId: null })).body.importedTransaction.categoryId).toBeNull();

      const ignored = await seedImported(a, { status: "ignored" });
      expect((await request(app).patch(`/v1/imported-transactions/${ignored.id}`).set(bearer(a.writeKey)).send({ categoryId: a.categoryId })).status).toBe(400);
    });

    it("ignore, unignore and import work, and a non-pending row is a 400", async () => {
      const row = await seedImported(a);
      expect((await request(app).post(`/v1/imported-transactions/${row.id}/ignore`).set(bearer(a.writeKey))).status).toBe(200);
      expect(await status(row.id)).toBe("ignored");
      expect((await request(app).post(`/v1/imported-transactions/${row.id}/ignore`).set(bearer(a.writeKey))).status).toBe(400);
      expect((await request(app).post(`/v1/imported-transactions/${row.id}/unignore`).set(bearer(a.writeKey))).status).toBe(200);
      expect(await status(row.id)).toBe("pending");

      const noCategory = await request(app).post(`/v1/imported-transactions/${row.id}/import`).set(bearer(a.writeKey)).send({});
      expect(noCategory.status).toBe(400);
      vi.mocked(auditLog).mockClear();
      const imported = await request(app).post(`/v1/imported-transactions/${row.id}/import`).set(bearer(a.writeKey)).send({ categoryId: a.categoryId });
      expect(imported.status).toBe(201);
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "imported.import", resourceId: row.id, status: 201 }));
      const created = await prisma.transaction.findFirst({ where: { userId: a.userId, name: row.description } });
      expect(created).toMatchObject({ type: "expense", categoryId: a.categoryId });
      expect((await request(app).post(`/v1/imported-transactions/${row.id}/import`).set(bearer(a.writeKey)).send({ categoryId: a.categoryId })).status).toBe(400);
    });

    it("batch routes work in ids mode, are all-or-nothing on a bad row, and enforce the 50 cap and ids-only mode", async () => {
      const rows = [await seedImported(a), await seedImported(a)];
      const ids = rows.map((r) => r.id);
      const path = (action: string) => `/v1/imported-transactions/batch-${action}`;
      const post = (action: string, body: object, key = a.writeKey) => request(app).post(path(action)).set(bearer(key)).send(body);

      const ignored = await post("ignore", { selection: { mode: "ids", ids } });
      expect(ignored.body).toEqual({ ignoredCount: 2, errors: [] });
      const again = await post("ignore", { selection: { mode: "ids", ids } });
      expect(again.status).toBe(400);
      expect(again.body.errors).toHaveLength(2);
      expect((await post("unignore", { selection: { mode: "ids", ids } })).body).toEqual({ unignoredCount: 2, errors: [] });

      const mixed = await seedImported(a, { status: "ignored" });
      const failed = await post("import", { selection: { mode: "ids", ids: [...ids, mixed.id] }, categoryId: a.categoryId });
      expect(failed.status).toBe(400);
      expect(failed.body.errors).toEqual([expect.objectContaining({ id: mixed.id })]);
      expect(await prisma.providerImportedTransaction.count({ where: { id: { in: ids }, status: "pending" } })).toBe(2);

      const done = await post("import", { selection: { mode: "ids", ids }, categoryId: a.categoryId });
      expect(done.status).toBe(201);
      expect(done.body.importedCount).toBe(2);

      const tooMany = Array.from({ length: 51 }, (_, i) => `id-${i}`);
      for (const action of ["ignore", "unignore", "import"]) {
        expect((await post(action, { selection: { mode: "ids", ids: tooMany } })).status).toBe(400);
        expect((await post(action, { selection: { mode: "filtered" } })).status).toBe(400);
        expect((await post(action, { selection: { mode: "ids", ids: [] } })).status).toBe(400);
      }
    });

    it("rejects read keys and anonymous callers on every write route without changing data", async () => {
      const row = await seedImported(a);
      const routes: [string, string, object][] = [
        ["patch", `/v1/imported-transactions/${row.id}`, { categoryId: a.categoryId }],
        ["post", `/v1/imported-transactions/${row.id}/ignore`, {}],
        ["post", `/v1/imported-transactions/${row.id}/unignore`, {}],
        ["post", `/v1/imported-transactions/${row.id}/import`, { categoryId: a.categoryId }],
        ["post", "/v1/imported-transactions/batch-ignore", { selection: { mode: "ids", ids: [row.id] } }],
        ["post", "/v1/imported-transactions/batch-unignore", { selection: { mode: "ids", ids: [row.id] } }],
        ["post", "/v1/imported-transactions/batch-import", { selection: { mode: "ids", ids: [row.id] }, categoryId: a.categoryId }],
        ["patch", "/v1/notifications/read-all", {}],
        ["patch", "/v1/me", { name: "Hacked" }]
      ];
      for (const [method, path, body] of routes) {
        const forbidden = await (request(app) as any)[method](path).set(bearer(a.readKey)).send(body); // eslint-disable-line @typescript-eslint/no-explicit-any
        expect(forbidden.status, `${method} ${path}`).toBe(403);
        expect((await (request(app) as any)[method](path).send(body)).status).toBe(401); // eslint-disable-line @typescript-eslint/no-explicit-any
      }
      expect(await status(row.id)).toBe("pending");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).name).not.toBe("Hacked");
    });

    it("treats another user's rows as 404 (single) or skips them (batch) and changes nothing", async () => {
      const foreign = await seedImported(b);
      for (const [method, path, body] of [
        ["patch", `/v1/imported-transactions/${foreign.id}`, { categoryId: a.categoryId }],
        ["post", `/v1/imported-transactions/${foreign.id}/ignore`, {}],
        ["post", `/v1/imported-transactions/${foreign.id}/unignore`, {}],
        ["post", `/v1/imported-transactions/${foreign.id}/import`, { categoryId: a.categoryId }]
      ] as const) {
        expect((await request(app)[method](path).set(bearer(a.writeKey)).send(body)).status, path).toBe(404);
      }
      const batch = await request(app).post("/v1/imported-transactions/batch-ignore").set(bearer(a.writeKey)).send({ selection: { mode: "ids", ids: [foreign.id] } });
      expect(batch.body).toEqual({ ignoredCount: 0, errors: [] });
      expect(await status(foreign.id)).toBe("pending");
    });
  });

  describe("notifications over REST", () => {
    it("reports the unread count and marks one or all read, scoped to the caller", async () => {
      const mine = await seedNotification(a);
      await seedNotification(a);
      const theirs = await seedNotification(b);
      const count = (key: string) => request(app).get("/v1/notifications/unread-count").set(bearer(key));

      const before = (await count(a.readKey)).body.count as number;
      expect(before).toBeGreaterThanOrEqual(2);
      expect((await request(app).get("/v1/notifications/unread-count")).status).toBe(401);

      vi.mocked(auditLog).mockClear();
      const one = await request(app).patch(`/v1/notifications/${mine.id}/read`).set(bearer(a.writeKey));
      expect(one.status).toBe(200);
      expect(one.body.notification.readAt).not.toBeNull();
      expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "notification.read", resourceId: mine.id, status: 200 }));
      expect((await count(a.readKey)).body.count).toBe(before - 1);

      expect((await request(app).patch(`/v1/notifications/${theirs.id}/read`).set(bearer(a.writeKey))).status).toBe(404);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();

      expect((await request(app).patch("/v1/notifications/read-all").set(bearer(a.writeKey))).status).toBe(204);
      expect((await count(a.readKey)).body.count).toBe(0);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
    });
  });

  describe("profile over REST", () => {
    it("GET /v1/me returns the profile without passwordHash for either key", async () => {
      for (const key of [a.readKey, a.writeKey]) {
        const res = await request(app).get("/v1/me").set(bearer(key));
        expect(res.status).toBe(200);
        expect(res.body.user).toMatchObject({ id: a.userId });
        expect(res.body.user).not.toHaveProperty("passwordHash");
      }
    });

    it("PATCH /v1/me changes only name and preferredCurrency; email, plan and password are ignored", async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: b.userId } });
      const res = await request(app)
        .patch("/v1/me")
        .set(bearer(b.writeKey))
        .send({ name: "Renamed", preferredCurrency: "MXN", email: "evil@example.com", planType: "pro", password: "x" });
      expect(res.status).toBe(200);
      const after = await prisma.user.findUniqueOrThrow({ where: { id: b.userId } });
      expect(after).toMatchObject({ name: "Renamed", preferredCurrency: "MXN", email: before.email, planType: before.planType, passwordHash: before.passwordHash });

      expect((await request(app).patch("/v1/me").set(bearer(b.writeKey)).send({})).status).toBe(400);
      expect((await request(app).patch("/v1/me").set(bearer(b.writeKey)).send({ preferredCurrency: null })).status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: b.userId } })).preferredCurrency).toBeNull();
    });
  });

  describe("MCP tools", () => {
    it("lists the new read tools for a read key and the new write tools only for a write key", async () => {
      const readNames = (await a.read.listTools()).tools.map((t) => t.name);
      const writeTools = (await a.write.listTools()).tools;
      const newReads = ["get_transaction", "list_currencies", "get_profile"];
      const newWrites = ["update_imported_transaction", "ignore_imported_transactions", "unignore_imported_transactions", "import_imported_transactions", "update_preferences", "mark_notifications_read"];
      for (const name of newReads) expect(readNames).toContain(name);
      for (const name of newWrites) {
        expect(readNames).not.toContain(name);
        expect(writeTools.map((t) => t.name)).toContain(name);
      }
      expect(writeTools.find((t) => t.name === "import_imported_transactions")!.description).toMatch(/explicit user confirmation/);
      expect(writeTools.find((t) => t.name === "get_profile")!.annotations).toMatchObject({ readOnlyHint: true });
    });

    it("refuses every new write tool for a read key and changes nothing", async () => {
      const row = await seedImported(a);
      for (const [name, args] of [
        ["update_imported_transaction", { id: row.id, categoryId: a.categoryId }],
        ["ignore_imported_transactions", { ids: [row.id] }],
        ["unignore_imported_transactions", { ids: [row.id] }],
        ["import_imported_transactions", { ids: [row.id], categoryId: a.categoryId }],
        ["update_preferences", { name: "Hacked" }],
        ["mark_notifications_read", { all: true }]
      ] as const) {
        expect((await call(a.read, name, args)).isError, name).toBe(true);
      }
      expect(await status(row.id)).toBe("pending");
      expect((await prisma.user.findUniqueOrThrow({ where: { id: a.userId } })).name).not.toBe("Hacked");
    });

    it("get_transaction matches GET /v1/transactions/:id and hides other users' transactions", async () => {
      const own = await prisma.transaction.create({ data: { userId: a.userId, name: "Mine", amount: 5, amountInPreferredCurrency: 5, type: "expense", date: new Date("2024-01-15") } });
      const foreign = await prisma.transaction.create({ data: { userId: b.userId, name: "Theirs", amount: 5, amountInPreferredCurrency: 5, type: "expense", date: new Date("2024-01-15") } });
      const viaMcp = await call(a.read, "get_transaction", { id: own.id });
      const viaRest = await request(app).get(`/v1/transactions/${own.id}`).set(bearer(a.readKey));
      expect(viaMcp.structuredContent).toEqual(viaRest.body);
      const hidden = await call(a.read, "get_transaction", { id: foreign.id });
      expect(hidden.isError).toBe(true);
      expect(hidden.content[0]!.text).toMatch(/not found/i);
    });

    it("list_currencies matches GET /v1/currencies", async () => {
      const viaMcp = await call(a.read, "list_currencies");
      const viaRest = await request(app).get("/v1/currencies").set(bearer(a.readKey));
      expect(viaMcp.structuredContent).toEqual(viaRest.body);
    });

    it("get_profile matches GET /v1/me", async () => {
      const viaMcp = await call(a.read, "get_profile");
      const viaRest = await request(app).get("/v1/me").set(bearer(a.readKey));
      expect(viaMcp.structuredContent).toEqual(viaRest.body);
      expect(viaMcp.structuredContent!.user).not.toHaveProperty("passwordHash");
    });

    it("update_preferences changes only name and currency and matches REST state", async () => {
      const before = await prisma.user.findUniqueOrThrow({ where: { id: a.userId } });
      const res = await call(a.write, "update_preferences", { name: "Via MCP", preferredCurrency: "EUR", email: "evil@example.com" });
      expect(res.isError).toBeFalsy();
      const after = await prisma.user.findUniqueOrThrow({ where: { id: a.userId } });
      expect(after).toMatchObject({ name: "Via MCP", preferredCurrency: "EUR", email: before.email, planType: before.planType });
      expect((await call(a.write, "update_preferences", {})).isError).toBe(true);
    });

    it("list_notifications adds unreadCount equal to GET /v1/notifications/unread-count; mark_notifications_read marks one or all", async () => {
      const n = await seedNotification(a);
      const theirs = await seedNotification(b);
      const viaRest = await request(app).get("/v1/notifications/unread-count").set(bearer(a.readKey));
      const listed = await call(a.read, "list_notifications");
      expect(listed.structuredContent!.unreadCount).toBe(viaRest.body.count);

      expect((await call(a.write, "mark_notifications_read", { id: n.id })).structuredContent!.notification.readAt).not.toBeNull();
      const foreign = await call(a.write, "mark_notifications_read", { id: theirs.id });
      expect(foreign.isError).toBe(true);
      expect(foreign.content[0]!.text).toMatch(/not found/i);
      expect((await call(a.write, "mark_notifications_read", {})).isError).toBe(true);
      expect((await call(a.write, "mark_notifications_read", { id: n.id, all: true })).isError).toBe(true);

      await seedNotification(a);
      expect((await call(a.write, "mark_notifications_read", { all: true })).structuredContent).toEqual({ allRead: true });
      expect((await call(a.read, "list_notifications")).structuredContent!.unreadCount).toBe(0);
      expect((await prisma.notification.findUniqueOrThrow({ where: { id: theirs.id } })).readAt).toBeNull();
    });

    it("imported-review tools mirror the REST behaviour, including failures and caps", async () => {
      const row = await seedImported(a);
      const upd = await call(a.write, "update_imported_transaction", { id: row.id, categoryId: a.categoryId });
      expect(upd.structuredContent!.importedTransaction.categoryId).toBe(a.categoryId);
      expect((await call(a.write, "update_imported_transaction", { id: row.id, categoryId: a.incomeCategoryId })).isError).toBe(true);

      expect((await call(a.write, "ignore_imported_transactions", { ids: [row.id] })).structuredContent).toEqual({ ignoredCount: 1, errors: [] });
      const nonPending = await call(a.write, "ignore_imported_transactions", { ids: [row.id] });
      expect(nonPending.isError).toBe(true);
      expect(nonPending.content[0]!.text).toMatch(/cannot be ignored/);
      expect((await call(a.write, "update_imported_transaction", { id: row.id, categoryId: a.categoryId })).isError).toBe(true);
      expect((await call(a.write, "unignore_imported_transactions", { ids: [row.id] })).structuredContent).toEqual({ unignoredCount: 1, errors: [] });

      const imported = await call(a.write, "import_imported_transactions", { ids: [row.id] });
      expect(imported.structuredContent).toMatchObject({ importedCount: 1, errors: [] });
      expect(await status(row.id)).toBe("processed");
      const again = await call(a.write, "import_imported_transactions", { ids: [row.id], categoryId: a.categoryId });
      expect(again.isError).toBe(true);
      expect(again.content[0]!.text).toMatch(/cannot be imported/);

      const tooMany = Array.from({ length: 51 }, (_, i) => `id-${i}`);
      for (const name of ["ignore_imported_transactions", "unignore_imported_transactions", "import_imported_transactions"]) {
        expect((await call(a.write, name, { ids: tooMany })).isError, name).toBe(true);
        expect((await call(a.write, name, { ids: [] })).isError, name).toBe(true);
        expect((await call(a.write, name, { selection: { mode: "filtered" } })).isError, name).toBe(true);
      }
    });

    it("imported-review tools never touch another user's rows", async () => {
      const foreign = await seedImported(b);
      expect((await call(a.write, "update_imported_transaction", { id: foreign.id, categoryId: a.categoryId })).content[0]!.text).toMatch(/not found/i);
      expect((await call(a.write, "ignore_imported_transactions", { ids: [foreign.id] })).structuredContent).toEqual({ ignoredCount: 0, errors: [] });
      expect((await call(a.write, "import_imported_transactions", { ids: [foreign.id], categoryId: a.categoryId })).structuredContent).toMatchObject({ importedCount: 0 });
      expect(await status(foreign.id)).toBe("pending");
      expect(await prisma.transaction.count({ where: { userId: a.userId, name: foreign.description } })).toBe(0);
    });
  });
});
