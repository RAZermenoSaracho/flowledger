import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";

// Cross-module integration test (needs Docker, see CLAUDE.local.md): paged transactions and imported-transactions lists.
let app: Express;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];
type Actor = Awaited<ReturnType<typeof createAuthedUser>>;
const as = (u: Actor, req: request.Test) => req.set("Authorization", `Bearer ${u.token}`);
const q = (query: unknown) => encodeURIComponent(JSON.stringify(query));

describe("list pagination", () => {
  let a: Actor;
  let b: Actor;
  let groupId: string;
  let aIds: string[];

  async function createTransaction(user: Actor, accountId: string, categoryId: string, gid: string | null, n: number) {
    const res = await as(user, request(app).post("/transactions")).send({
      name: `t${n}`,
      amount: 1,
      type: "expense",
      date: "2024-01-15",
      accountId,
      categoryId,
      groupId: gid
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body.transaction.id as string;
  }

  async function seedImported(user: Actor, n: number) {
    return prisma.providerImportedTransaction.create({
      data: {
        userId: user.user.id,
        provider: "test",
        providerCredentialId: "cred",
        providerAccountId: "acc",
        providerTransactionId: `${user.user.id}-${n}`,
        description: `Import ${n}`,
        amount: -5,
        currency: "USD",
        transactionDate: new Date("2024-01-15"),
        rawData: {}
      }
    });
  }

  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    a = await createAuthedUser(app);
    b = await createAuthedUser(app);

    groupId = (await as(a, request(app).post("/groups")).send({ name: "G" })).body.group.id;
    const otherGroupId = (await as(a, request(app).post("/groups")).send({ name: "H" })).body.group.id;
    for (const gid of [groupId, otherGroupId]) {
      expect((await as(a, request(app).post(`/groups/${gid}/members`)).send({ userId: b.user.id })).status).toBe(201);
    }

    const groupCategory = async (gid: string) =>
      (await as(a, request(app).post(`/groups/${gid}/categories`)).send({ name: "Shared", type: "expense" })).body.category.id as string;
    const gCategory = await groupCategory(groupId);
    const hCategory = await groupCategory(otherGroupId);

    const setup = async (user: Actor) => ({
      accountId: (await as(user, request(app).post("/accounts")).send({ name: "Cash", type: "cash" })).body.account.id as string,
      categoryId: (await as(user, request(app).post("/categories")).send({ name: "Food", type: "expense" })).body.category.id as string
    });
    const sa = await setup(a);
    const sb = await setup(b);

    aIds = [];
    for (let n = 0; n < 25; n++) aIds.push(await createTransaction(a, sa.accountId, gCategory, groupId, n));
    for (let n = 0; n < 5; n++) await createTransaction(a, sa.accountId, hCategory, otherGroupId, 100 + n);
    for (let n = 0; n < 7; n++) await createTransaction(b, sb.accountId, gCategory, groupId, 200 + n);
  }, 300_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  const listG = (pagination: unknown) =>
    as(
      a,
      request(app).get(
        `/transactions?query=${q({
          where: { field: "groupId", op: "=", value: groupId },
          sort: [{ field: "date", direction: "desc" }],
          pagination
        })}`
      )
    );

  describe("transactions", () => {
    it("pages cover each of the caller's group transactions exactly once, never another user's or group's", async () => {
      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        const res = await listG({ kind: "offset", page, pageSize: 10 });
        expect(res.status).toBe(200);
        expect(res.body.meta.total).toBe(25);
        seen.push(...res.body.data.map((t: { id: string }) => t.id));
      }
      expect(seen).toHaveLength(25);
      expect(new Set(seen)).toEqual(new Set(aIds));
    });

    it("returns an empty page with the full total when out of range", async () => {
      const res = await listG({ kind: "offset", page: 99, pageSize: 10 });
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta.total).toBe(25);
    });

    it.each([0, 1.5, "x"])("rejects pageSize %j with 400", async (pageSize) => {
      expect((await listG({ kind: "offset", page: 1, pageSize })).status).toBe(400);
    });

    it("clamps an oversized page size", async () => {
      const res = await listG({ kind: "offset", page: 1, pageSize: 100000 });
      expect(res.status).toBe(200);
      expect(res.body.meta.pageSize).toBeLessThanOrEqual(10000);
      expect(res.body.data).toHaveLength(25);
    });
  });

  describe("imported transactions", () => {
    let importedIds: string[];
    const listImported = (query?: unknown) =>
      as(a, request(app).get(`/transactions/imported${query ? `?query=${q(query)}` : ""}`));

    beforeAll(async () => {
      importedIds = [];
      for (let n = 0; n < 12; n++) importedIds.push((await seedImported(a, n)).id);
      await seedImported(b, 0);
    });

    it("returns one page of rows with the full total, and every row once across pages", async () => {
      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        const res = await listImported({ pagination: { kind: "offset", page, pageSize: 5 } });
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(12);
        expect(res.body.importedTransactions.length).toBe(page === 3 ? 2 : 5);
        seen.push(...res.body.importedTransactions.map((t: { id: string }) => t.id));
      }
      expect(new Set(seen)).toEqual(new Set(importedIds));
      expect(seen).toHaveLength(12);
    });

    it("leaves an unpaginated call returning every row", async () => {
      const res = await listImported();
      expect(res.body.total).toBe(12);
      expect(res.body.importedTransactions).toHaveLength(12);
    });

    it("rejects an invalid page size", async () => {
      expect((await listImported({ pagination: { kind: "offset", page: 1, pageSize: 0 } })).status).toBe(400);
    });

    it("batch select-all-filtered acts on every match, not one page", async () => {
      const res = await as(a, request(app).post("/transactions/imported/batch-ignore")).send({
        selection: { mode: "filtered", where: { field: "status", op: "=", value: "pending" } }
      });
      expect(res.status).toBe(200);
      expect(res.body.ignoredCount).toBe(12);
      expect(await prisma.providerImportedTransaction.count({ where: { userId: a.user.id, status: "ignored" } })).toBe(12);
    });
  });
});
