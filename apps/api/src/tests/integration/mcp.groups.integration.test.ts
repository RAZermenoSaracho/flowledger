import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test: needs Docker (see CLAUDE.local.md). Drives the group MCP tools with the real
// SDK client for users A (group admin), B (member) and C (stranger) and compares reads with the /v1 routes.
let app: Express;
let server: Server;
let baseUrl: string;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type McpResult = { isError?: boolean; structuredContent?: Json; content: { text: string }[] };
interface Actor {
  jwt: string;
  userId: string;
  accountId: string;
  readKey: string;
  writeKey: string;
  read: Client;
  write: Client;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function connect(key: string) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), { requestInit: { headers: bearer(key) } })
  );
  return client;
}

async function mintKey(jwt: string, allowWrite: boolean) {
  const res = await request(app).post("/users/me/api-keys").set(bearer(jwt)).send({ name: "mcp", allowWrite, lifetime: "1m" });
  return res.body.key as string;
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
  const account = await request(app).post("/accounts").set(bearer(jwt)).send({ name: "Checking", type: "checking" });
  const readKey = await mintKey(jwt, false);
  const writeKey = await mintKey(jwt, true);
  return {
    jwt,
    userId: user.id,
    accountId: account.body.account.id as string,
    readKey,
    writeKey,
    read: await connect(readKey),
    write: await connect(writeKey)
  };
}

const counts = () =>
  Promise.all([
    prisma.group.count(),
    prisma.groupMember.count(),
    prisma.sharedExpense.count(),
    prisma.settlementRequest.count(),
    prisma.notification.count()
  ]);

describe("MCP group tools", () => {
  let a: Actor;
  let b: Actor;
  let c: Actor;
  let groupId: string;
  let expenseCategoryId: string;
  let sharedExpenseId: string;
  let debtId: string;

  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    server = app.listen(0);
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    a = await createActor();
    b = await createActor();
    c = await createActor();
  }, 180_000);

  afterAll(async () => {
    server?.close();
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it("lists the group read tools for read keys and all ten for write keys, without approval tools", async () => {
    const readNames = (await a.read.listTools()).tools.map((t) => t.name);
    const writeTools = (await a.write.listTools()).tools;
    const groupTools = ["list_groups", "list_shared_expenses", "search_users"];
    const groupWrites = ["create_group", "update_group", "set_group_archived", "remove_group_member", "create_shared_expense", "request_settlement", "add_group_member", "create_group_category"];

    expect(readNames).toEqual(expect.arrayContaining(groupTools));
    for (const name of groupWrites) {
      expect(readNames).not.toContain(name);
      expect(writeTools.map((t) => t.name)).toContain(name);
    }
    const all = writeTools.map((t) => t.name).join(" ");
    expect(all).not.toMatch(/approve|reject|settle_debt|delete_group|update_shared_expense|delete_shared_expense/);
    expect(writeTools.find((t) => t.name === "remove_group_member")!.annotations).toMatchObject({ destructiveHint: true });
    for (const name of ["create_shared_expense", "request_settlement", "remove_group_member", "add_group_member"]) {
      expect(writeTools.find((t) => t.name === name)!.description).toMatch(/notif|Affects another user/i);
    }
  });

  it("refuses every write tool for a read key and changes nothing", async () => {
    const before = await counts();
    for (const [name, args] of [
      ["create_group", { name: "Nope" }],
      ["update_group", { id: "x", name: "Nope" }],
      ["set_group_archived", { id: "x", archived: true }],
      ["remove_group_member", { groupId: "x" }],
      ["create_shared_expense", { transactionId: "x", title: "t" }],
      ["request_settlement", { debtId: "x", amount: 1, accountId: "a", categoryId: "c" }],
      ["add_group_member", { groupId: "x", userId: "y" }],
      ["create_group_category", { groupId: "x", name: "n", type: "expense" }]
    ] as const) {
      expect((await call(a.read, name, args)).isError, name).toBe(true);
    }
    expect(await counts()).toEqual(before);
  });

  it("creates a group as admin and enforces membership and admin rules", async () => {
    const created = await call(a.write, "create_group", { name: "Trip", description: "Beach" });
    expect(created.isError).toBeFalsy();
    groupId = created.structuredContent!.group.id;
    expect(await prisma.groupMember.findFirstOrThrow({ where: { groupId, userId: a.userId } })).toMatchObject({ role: "admin" });

    await request(app).post(`/groups/${groupId}/members`).set(bearer(a.jwt)).send({ userId: b.userId }).expect(201);
    const category = await request(app).post(`/groups/${groupId}/categories`).set(bearer(a.jwt)).send({ name: "Shared", type: "expense" });
    expenseCategoryId = category.body.category.id;

    const asB = await call(b.read, "list_groups", { id: groupId });
    expect(asB.structuredContent!.group.members).toHaveLength(2);
    expect((await call(c.read, "list_groups", { id: groupId })).isError).toBe(true);
    expect((await call(c.read, "list_groups")).structuredContent!.groups).toEqual([]);

    const before = await counts();
    expect((await call(b.write, "update_group", { id: groupId, name: "Hijack" })).isError).toBe(true);
    expect((await call(b.write, "set_group_archived", { id: groupId, archived: true })).isError).toBe(true);
    expect((await call(c.write, "update_group", { id: groupId, name: "Hijack" })).isError).toBe(true);
    expect((await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).name).toBe("Trip");
    expect(await counts()).toEqual(before);

    expect((await call(a.write, "update_group", { id: groupId, name: "Trip 2", ownerUserId: c.userId })).structuredContent!.group.name).toBe("Trip 2");
    expect((await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).ownerUserId).toBe(a.userId);
    await call(a.write, "set_group_archived", { id: groupId, archived: true });
    expect((await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).isArchived).toBe(true);
    await call(a.write, "set_group_archived", { id: groupId, archived: false });
    expect((await prisma.group.findUniqueOrThrow({ where: { id: groupId } })).isArchived).toBe(false);
  });

  it("matches the REST read of the same group and shared expenses", async () => {
    const viaTool = (await call(a.read, "list_groups", { id: groupId })).structuredContent!.group;
    const viaRest = (await request(app).get(`/v1/groups/${groupId}`).set(bearer(a.readKey))).body.group;
    expect(viaTool).toEqual(viaRest);
  });

  it("creates shared expenses only on group transactions with member participants", async () => {
    const personal = await prisma.transaction.create({
      data: { userId: a.userId, name: "Solo", amount: 50, amountInPreferredCurrency: 50, type: "expense", date: new Date("2024-02-01"), accountId: a.accountId }
    });
    const tx = await request(app).post("/transactions").set(bearer(a.jwt)).send({
      name: "Dinner", amount: 100, type: "expense", date: "2024-02-01", accountId: a.accountId, categoryId: expenseCategoryId, groupId
    });
    const transactionId = tx.body.transaction.id as string;
    const participant = (userId: string, shareAmount: number) => ({ userId, participantName: "P", shareAmount });

    const before = await counts();
    expect((await call(a.write, "create_shared_expense", { transactionId: personal.id, title: "t", participants: [participant(b.userId, 50)] })).isError).toBe(true);
    expect((await call(a.write, "create_shared_expense", { transactionId, title: "t", participants: [participant(c.userId, 50)] })).isError).toBe(true);
    expect((await call(b.write, "create_shared_expense", { transactionId, title: "t", participants: [participant(b.userId, 50)] })).isError).toBe(true);
    expect(await counts()).toEqual(before);

    const created = await call(a.write, "create_shared_expense", { transactionId, title: "Dinner", participants: [participant(b.userId, 40)] });
    expect(created.isError).toBeFalsy();
    sharedExpenseId = created.structuredContent!.sharedExpense.id;
    expect(await prisma.notification.count({ where: { userId: b.userId, type: "shared_expense_added" } })).toBe(1);
    debtId = (await prisma.sharedExpenseParticipant.findFirstOrThrow({ where: { sharedExpenseId, userId: b.userId } })).id;

    expect((await call(c.read, "list_shared_expenses")).structuredContent).toEqual({ sharedExpenses: [], total: 0 });
    expect((await call(c.read, "list_shared_expenses", { id: sharedExpenseId })).isError).toBe(true);
    const asB = await call(b.read, "list_shared_expenses");
    expect(asB.structuredContent!.total).toBe(1);
    const viaRest = (await request(app).get("/v1/shared-expenses").set(bearer(b.readKey))).body;
    expect(asB.structuredContent).toEqual(viaRest);
  });

  it("lets only the debtor request a settlement, once, leaving approval to REST", async () => {
    const args = { debtId, amount: 40, accountId: b.accountId, categoryId: expenseCategoryId };
    const before = await counts();
    expect((await call(a.write, "request_settlement", { ...args, accountId: a.accountId })).isError).toBe(true);
    expect((await call(c.write, "request_settlement", args)).isError).toBe(true);
    expect(await counts()).toEqual(before);

    const created = await call(b.write, "request_settlement", args);
    expect(created.isError).toBeFalsy();
    expect(await prisma.notification.count({ where: { userId: a.userId, type: "settlement_requested" } })).toBeGreaterThan(0);
    expect((await call(b.write, "request_settlement", args)).isError).toBe(true);
    expect(await prisma.settlementRequest.count({ where: { sharedExpenseParticipantId: debtId } })).toBe(1);
  });

  it("allows self-leave and admin removal only", async () => {
    expect((await call(b.write, "remove_group_member", { groupId, userId: a.userId })).isError).toBe(true);
    expect((await call(c.write, "remove_group_member", { groupId, userId: b.userId })).isError).toBe(true);
    expect(await prisma.groupMember.count({ where: { groupId } })).toBe(2);

    expect((await call(b.write, "remove_group_member", { groupId })).structuredContent).toMatchObject({ removed: true, userId: b.userId });
    expect(await prisma.groupMember.count({ where: { groupId, userId: b.userId } })).toBe(0);
    expect(await prisma.categoryUser.count({ where: { userId: b.userId, category: { groupId } } })).toBe(0);

    await request(app).post(`/groups/${groupId}/members`).set(bearer(a.jwt)).send({ userId: b.userId }).expect(201);
    expect((await call(a.write, "remove_group_member", { groupId, userId: b.userId })).isError).toBeFalsy();
    expect(await prisma.groupMember.count({ where: { groupId, userId: b.userId } })).toBe(0);
  });

  it("searches users with caps, adds members and creates group categories as admin only, matching REST", async () => {
    const { user: target } = await createAuthedUser(app, { name: "Mcp Findable" });
    for (let i = 0; i < 11; i++) await createAuthedUser(app, { name: `Mcpcap ${i}` });
    const g = (await call(a.write, "create_group", { name: "McpAdds" })).structuredContent!.group.id as string;
    await request(app).post(`/groups/${g}/members`).set(bearer(a.jwt)).send({ userId: b.userId }).expect(201);

    expect((await call(a.read, "search_users", { q: "mc" })).isError).toBe(true);
    expect((await call(a.read, "search_users", { q: "mcpcap", limit: 11 })).isError).toBe(true);
    const found = await call(a.read, "search_users", { q: "Mcp Find" });
    expect(found.structuredContent).toEqual({ users: [{ id: target.id, name: "Mcp Findable", email: target.email }] });
    expect((await call(a.read, "search_users", { q: "mcpcap" })).structuredContent!.users).toHaveLength(10);
    const viaRest = (await request(app).get("/v1/users/search?q=Mcp%20Find").set(bearer(a.readKey))).body;
    expect(found.structuredContent).toEqual(viaRest);

    const before = await counts();
    const cats = await prisma.category.count();
    for (const actor of [b, c]) {
      expect((await call(actor.write, "add_group_member", { groupId: g, userId: target.id })).isError).toBe(true);
      expect((await call(actor.write, "create_group_category", { groupId: g, name: "Rent", type: "expense" })).isError).toBe(true);
    }
    expect(await counts()).toEqual(before);
    expect(await prisma.category.count()).toBe(cats);

    const added = await call(a.write, "add_group_member", { groupId: g, userId: target.id, role: "admin" });
    expect(added.isError).toBeFalsy();
    expect(await prisma.groupMember.findFirstOrThrow({ where: { groupId: g, userId: target.id } })).toMatchObject({ role: "member" });
    expect(await prisma.notification.count({ where: { userId: target.id, type: "group_member_added" } })).toBe(1);
    expect((await call(a.write, "add_group_member", { groupId: g, userId: target.id })).isError).toBe(true);

    const category = await call(a.write, "create_group_category", { groupId: g, name: "Rent", type: "expense" });
    expect(category.isError).toBeFalsy();
    const users = await prisma.categoryUser.findMany({ where: { categoryId: category.structuredContent!.category.id } });
    expect(users.map((u) => u.userId).sort()).toEqual([a.userId, b.userId, target.id].sort());
  }, 60_000);
});
