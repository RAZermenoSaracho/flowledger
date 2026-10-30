import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test: needs Docker (see CLAUDE.local.md). Drives /mcp with the real SDK
// client against a listening app over a testcontainers Postgres.
let app: Express;
let server: Server;
let baseUrl: string;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];

type AuthedUser = Awaited<ReturnType<typeof createAuthedUser>>;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type McpResult = { isError?: boolean; structuredContent?: Json; content: { text: string }[] };

async function mintKey(user: AuthedUser, allowWrite: boolean, lifetime = "1m") {
  const response = await request(app)
    .post("/users/me/api-keys")
    .set("Authorization", `Bearer ${user.token}`)
    .send({ name: "mcp-test", allowWrite, lifetime });
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
  return (await client.callTool({ name, arguments: args })) as McpResult;
}

function rawPost(headers: Record<string, string>) {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" })
  });
}

const txBody = { name: "Coffee", amount: 4.5, type: "expense", date: "2024-03-10" };

describe("MCP server", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }, 120_000);

  afterAll(async () => {
    server?.close();
    await stopTestDatabase();
  });

  it("lists 4 tools for a read key and 6 for a write key", async () => {
    const user = await createAuthedUser(app);
    const read = await connect((await mintKey(user, false)).key);
    const write = await connect((await mintKey(user, true)).key);

    expect((await read.listTools()).tools.map((t) => t.name).sort()).toEqual([
      "get_transaction_summary",
      "list_accounts",
      "list_categories",
      "search_transactions"
    ]);
    expect((await write.listTools()).tools).toHaveLength(6);
  });

  it("refuses a write tool for a read key and creates nothing", async () => {
    const user = await createAuthedUser(app);
    const client = await connect((await mintKey(user, false)).key);

    const result = await client.callTool({ name: "create_transaction", arguments: txBody }).catch((e) => e);
    const failed = result instanceof Error || (result as McpResult).isError === true;

    expect(failed).toBe(true);
    expect(await prisma.transaction.count({ where: { userId: user.user.id } })).toBe(0);
  });

  it("creates and updates with a write key, isolates users, and matches REST", async () => {
    const owner = await createAuthedUser(app);
    const other = await createAuthedUser(app);
    const client = await connect((await mintKey(owner, true)).key);
    const otherClient = await connect((await mintKey(other, true)).key);

    const created = await call(client, "create_transaction", txBody);
    const id = created.structuredContent!.transaction.id as string;
    expect(created.isError).toBeUndefined();

    const updated = await call(client, "update_transaction", { id, name: "Latte" });
    expect(updated.structuredContent!.transaction.name).toBe("Latte");

    const foreign = await call(otherClient, "update_transaction", { id, name: "Hacked" });
    expect(foreign).toMatchObject({ isError: true, content: [{ text: "Transaction not found" }] });
    expect((await call(otherClient, "search_transactions")).structuredContent!.data).toEqual([]);

    const foreignAccount = await request(app)
      .post("/accounts")
      .set("Authorization", `Bearer ${other.token}`)
      .send({ name: "Theirs", type: "checking", currency: "USD", initialBalance: 0 });
    const badCreate = await call(client, "create_transaction", {
      ...txBody,
      accountId: foreignAccount.body.account?.id ?? "missing"
    });
    expect(badCreate.isError).toBe(true);

    const filter = { type: "expense", dateFrom: "2024-03-01", dateTo: "2024-03-10" };
    const query = JSON.stringify({
      where: {
        and: [
          { field: "date", op: ">=", value: "2024-03-01T00:00:00.000Z" },
          { field: "date", op: "<=", value: "2024-03-10T23:59:59.999Z" },
          { field: "type", op: "=", value: "expense" }
        ]
      },
      sort: [{ field: "date", direction: "desc" }],
      pagination: { kind: "offset", page: 1, pageSize: 50 }
    });
    const rest = await request(app)
      .get("/transactions")
      .query({ query })
      .set("Authorization", `Bearer ${owner.token}`);
    const mcp = await call(client, "search_transactions", filter);
    const withoutTiming = ({ meta, ...r }: Json) => ({ ...r, meta: { ...meta, executionTime: 0 } });
    expect(withoutTiming(mcp.structuredContent!)).toEqual(withoutTiming(rest.body));
    expect(mcp.structuredContent!.data).toHaveLength(1);

    const restSummary = await request(app)
      .get("/transactions/summary")
      .query({ query: JSON.stringify({ where: JSON.parse(query).where }) })
      .set("Authorization", `Bearer ${owner.token}`);
    expect((await call(client, "get_transaction_summary", filter)).structuredContent).toEqual(
      restSummary.body
    );

    const restAccounts = await request(app).get("/accounts").set("Authorization", `Bearer ${owner.token}`);
    expect((await call(client, "list_accounts")).structuredContent).toEqual({
      accounts: restAccounts.body.accounts ?? restAccounts.body
    });
    const restCategories = await request(app).get("/categories").set("Authorization", `Bearer ${owner.token}`);
    expect((await call(client, "list_categories")).structuredContent).toEqual({
      categories: restCategories.body.categories ?? restCategories.body
    });
  });

  it("rejects pageSize 101", async () => {
    const user = await createAuthedUser(app);
    const client = await connect((await mintKey(user, false)).key);
    const result = await client.callTool({ name: "search_transactions", arguments: { pageSize: 101 } }).catch((e) => e);
    expect(result instanceof Error || (result as McpResult).isError === true).toBe(true);
  });

  it("returns 401 for missing header, web JWT, revoked and expired keys, without resource_metadata", async () => {
    const user = await createAuthedUser(app);
    const revoked = await mintKey(user, false);
    const expired = await mintKey(user, false);
    await request(app).delete(`/users/me/api-keys/${revoked.id}`).set("Authorization", `Bearer ${user.token}`);
    await prisma.apiKey.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const none = await rawPost({});
    expect(none.status).toBe(401);
    expect(none.headers.get("www-authenticate")).toContain('error="invalid_token"');
    expect(none.headers.get("www-authenticate")).not.toContain("resource_metadata");

    for (const token of [user.token, revoked.key, expired.key]) {
      expect((await rawPost({ Authorization: `Bearer ${token}` })).status).toBe(401);
    }
  });

  it("accepts a never-expiring key, issues no session id, and refuses Origin, GET and DELETE", async () => {
    const user = await createAuthedUser(app);
    const { key } = await mintKey(user, false, "never");
    const auth = { Authorization: `Bearer ${key}` };

    const good = await rawPost(auth);
    expect(good.status).toBe(200);
    expect(good.headers.get("mcp-session-id")).toBeNull();

    expect((await rawPost({ ...auth, Origin: "https://evil.example" })).status).toBe(403);
    for (const method of ["GET", "DELETE"]) {
      const response = await fetch(`${baseUrl}/mcp`, { method, headers: auth });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
  });

  it("logs exactly one audit line per write, without the token or amount", async () => {
    const user = await createAuthedUser(app);
    const { key, id: keyId } = await mintKey(user, true);
    const client = await connect(key);
    const spy = vi.spyOn(process.stdout, "write");

    await call(client, "create_transaction", { ...txBody, amount: 987.65 });
    const lines = spy.mock.calls.map(([chunk]) => String(chunk)).filter((line) => line.includes('"audit":true'));
    spy.mockRestore();

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(keyId);
    expect(lines[0]).toContain("mcp.create_transaction");
    expect(lines[0]).not.toContain(key);
    expect(lines[0]).not.toContain("987.65");
  });
});
