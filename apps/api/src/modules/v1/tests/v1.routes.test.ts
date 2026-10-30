import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createAuthedUser } from "../../../tests/helpers/authTestUser.js";
import {
  startTestDatabase,
  stopTestDatabase
} from "../../../tests/helpers/testDatabase.js";

vi.mock("../../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

let app: Express;
let prisma: typeof import("../../../db/prisma.js").prisma;

interface Actor {
  jwt: string;
  readKey: string;
  writeKey: string;
  accountId: string;
  categoryId: string;
  transactionId: string;
}

async function mintKey(jwt: string, allowWrite: boolean) {
  const res = await request(app)
    .post("/users/me/api-keys")
    .set("Authorization", `Bearer ${jwt}`)
    .send({ name: "k", allowWrite });
  return { key: res.body.key as string, id: res.body.apiKey.id as string };
}

function txBody(actor: Pick<Actor, "accountId" | "categoryId">, name = "Coffee") {
  return {
    name,
    amount: 5,
    type: "expense",
    date: "2024-01-15",
    accountId: actor.accountId,
    categoryId: actor.categoryId
  };
}

async function createActor(): Promise<Actor> {
  const { token: jwt } = await createAuthedUser(app);
  const bearer = { Authorization: `Bearer ${jwt}` };
  const account = await request(app).post("/accounts").set(bearer).send({ name: "Checking", type: "checking" });
  const category = await request(app).post("/categories").set(bearer).send({ name: "Food", type: "expense" });
  const partial = { accountId: account.body.account.id as string, categoryId: category.body.category.id as string };
  const tx = await request(app).post("/transactions").set(bearer).send(txBody(partial, "Seed"));
  return {
    jwt,
    ...partial,
    transactionId: tx.body.transaction.id as string,
    readKey: (await mintKey(jwt, false)).key,
    writeKey: (await mintKey(jwt, true)).key
  };
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

describe("/v1 routes", () => {
  let a: Actor;
  let b: Actor;

  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
    ({ prisma } = await import("../../../db/prisma.js"));
    a = await createActor();
    b = await createActor();
  }, 180_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  describe("authentication", () => {
    const paths = ["/v1/accounts", "/v1/transactions", "/v1/reports", "/v1/nope"];

    it.each(paths)("rejects missing credentials on %s with 401", async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
      expect(res.body.message).toEqual(expect.any(String));
    });

    it("rejects a web JWT with 401", async () => {
      expect((await request(app).get("/v1/accounts").set(bearer(a.jwt))).status).toBe(401);
    });

    it("rejects revoked and expired keys without echoing the token", async () => {
      const revoked = await mintKey(a.jwt, false);
      await request(app).delete(`/users/me/api-keys/${revoked.id}`).set(bearer(a.jwt));
      const res = await request(app).get("/v1/accounts").set(bearer(revoked.key));
      expect(res.status).toBe(401);
      expect(JSON.stringify(res.body)).not.toContain(revoked.key);

      const expired = await mintKey(a.jwt, false);
      await prisma.apiKey.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
      expect((await request(app).get("/v1/accounts").set(bearer(expired.key))).status).toBe(401);
    });
  });

  describe("allowlist", () => {
    it("returns a JSON 404 for unlisted routes, leaving data intact", async () => {
      for (const [method, path] of [
        ["get", "/v1/reports"],
        ["delete", "/v1/groups/x"],
        ["post", "/v1/imported-transactions/x/merge"],
        ["delete", "/v1/imported-transactions/x"]
      ] as const) {
        const res = await request(app)[method](path).set(bearer(a.writeKey)).send({});
        expect(res.status).toBe(404);
        expect(res.body.message).toEqual(expect.any(String));
      }
      const still = await request(app).get(`/v1/transactions/${a.transactionId}`).set(bearer(a.readKey));
      expect(still.status).toBe(200);
    });
  });

  describe("read routes", () => {
    it("serves all five GET routes with a read key", async () => {
      const k = bearer(a.readKey);
      const accounts = await request(app).get("/v1/accounts").set(k);
      expect(accounts.status).toBe(200);
      expect(accounts.body.data ?? accounts.body.accounts).toBeDefined();
      expect((await request(app).get("/v1/categories").set(k)).status).toBe(200);
      expect((await request(app).get("/v1/transactions").set(k)).status).toBe(200);
      expect((await request(app).get("/v1/transactions/summary").set(k)).status).toBe(200);
      const one = await request(app).get(`/v1/transactions/${a.transactionId}`).set(k);
      expect(one.status).toBe(200);
      expect(one.body.transaction.id).toBe(a.transactionId);
    });

    it("accepts a write key on GET routes", async () => {
      expect((await request(app).get("/v1/accounts").set(bearer(a.writeKey))).status).toBe(200);
    });

    it("scopes lists and ids to the key owner", async () => {
      const list = await request(app).get("/v1/transactions").set(bearer(a.readKey));
      const ids = (list.body.data as { id: string }[]).map((t) => t.id);
      expect(ids).toContain(a.transactionId);
      expect(ids).not.toContain(b.transactionId);

      const accounts = await request(app).get("/v1/accounts").set(bearer(a.readKey));
      expect(JSON.stringify(accounts.body)).not.toContain(b.accountId);

      const cross = await request(app).get(`/v1/transactions/${b.transactionId}`).set(bearer(a.readKey));
      expect(cross.status).toBe(404);
    });

    it("returns 400 for a malformed query", async () => {
      const res = await request(app).get("/v1/transactions").query({ query: "{nope" }).set(bearer(a.readKey));
      expect(res.status).toBe(400);
    });
  });

  describe("write routes", () => {
    it("rejects a read key with 403 before validation and creates nothing", async () => {
      const post = await request(app).post("/v1/transactions").set(bearer(a.readKey)).send({});
      expect(post.status).toBe(403);
      const put = await request(app)
        .put(`/v1/transactions/${a.transactionId}`)
        .set(bearer(a.readKey))
        .send(txBody(a, "Hacked"));
      expect(put.status).toBe(403);
      const check = await request(app).get(`/v1/transactions/${a.transactionId}`).set(bearer(a.readKey));
      expect(check.body.transaction.name).toBe("Seed");
    });

    it("creates (201) and updates (200) with a write key; 400 on invalid body", async () => {
      const created = await request(app).post("/v1/transactions").set(bearer(a.writeKey)).send(txBody(a, "Created"));
      expect(created.status).toBe(201);
      const id = created.body.transaction.id as string;

      const updated = await request(app).put(`/v1/transactions/${id}`).set(bearer(a.writeKey)).send(txBody(a, "Renamed"));
      expect(updated.status).toBe(200);
      expect(updated.body.transaction.name).toBe("Renamed");

      const invalid = await request(app).post("/v1/transactions").set(bearer(a.writeKey)).send({ ...txBody(a), amount: "abc" });
      expect(invalid.status).toBe(400);
      expect(invalid.body.message).toBe("Validation failed");
    });

    it("cannot update another user's transaction or reference their account", async () => {
      const put = await request(app)
        .put(`/v1/transactions/${b.transactionId}`)
        .set(bearer(a.writeKey))
        .send(txBody(a, "Stolen"));
      expect(put.status).toBe(404);
      const check = await request(app).get(`/v1/transactions/${b.transactionId}`).set(bearer(b.readKey));
      expect(check.body.transaction.name).toBe("Seed");

      const post = await request(app)
        .post("/v1/transactions")
        .set(bearer(a.writeKey))
        .send({ ...txBody(a, "Cross"), accountId: b.accountId });
      expect(post.status).toBeGreaterThanOrEqual(400);
      expect(await prisma.transaction.count({ where: { name: "Cross" } })).toBe(0);
    });
  });

  describe("pagination", () => {
    it("defaults to 50, clamps to 100, and leaves the internal route unchanged", async () => {
      const c = await createActor();
      const { userId } = await prisma.transaction.findUniqueOrThrow({ where: { id: c.transactionId } });
      await prisma.transaction.createMany({
        data: Array.from({ length: 110 }, (_, i) => ({
          userId,
          name: `Bulk ${i}`,
          amount: 1,
          type: "expense" as const,
          date: new Date("2024-02-01"),
          accountId: c.accountId,
          categoryId: c.categoryId,
          amountInPreferredCurrency: 1
        }))
      });

      const k = bearer(c.readKey);
      const def = await request(app).get("/v1/transactions").set(k);
      expect(def.body.data).toHaveLength(50);

      const big = await request(app)
        .get("/v1/transactions")
        .query({ query: JSON.stringify({ pagination: { kind: "offset", page: 1, pageSize: 500 } }) })
        .set(k);
      expect(big.body.data).toHaveLength(100);
      expect(big.body.meta.pageSize).toBe(100);

      const zero = await request(app)
        .get("/v1/transactions")
        .query({ query: JSON.stringify({ pagination: { kind: "offset", page: 1, pageSize: 0 } }) })
        .set(k);
      expect(zero.status).toBe(400);

      const internal = await request(app).get("/transactions").set(bearer(c.jwt));
      expect(internal.body.data).toHaveLength(111);
    });
  });

  describe("audit and rate limit", () => {
    it("emits one audit line per write (201, 403, 404) and none for GET", async () => {
      const { auditLog } = await import("../../../utils/auditLog.js");
      vi.mocked(auditLog).mockClear();

      const created = await request(app).post("/v1/transactions").set(bearer(a.writeKey)).send(txBody(a, "Aud"));
      await request(app).post("/v1/transactions").set(bearer(a.readKey)).send(txBody(a));
      await request(app).put(`/v1/transactions/${b.transactionId}`).set(bearer(a.writeKey)).send(txBody(a));
      await request(app).get("/v1/transactions").set(bearer(a.readKey));
      await new Promise((r) => setTimeout(r, 100));

      const lines = vi.mocked(auditLog).mock.calls.map(([entry]) => entry);
      expect(lines).toHaveLength(3);
      expect(lines[0]).toMatchObject({ op: "transaction.create", status: 201, resourceId: created.body.transaction.id });
      expect(lines[1]).toMatchObject({ op: "transaction.create", status: 403 });
      expect(lines[2]).toMatchObject({ op: "transaction.update", status: 404, resourceId: b.transactionId });
      expect(JSON.stringify(lines)).not.toContain("Aud");
    });

    it("mounts the shared limiter on /v1", async () => {
      const res = await request(app).get("/v1/accounts");
      expect(res.headers["ratelimit"] ?? res.headers["ratelimit-policy"]).toBeDefined();
    });
  });
});
