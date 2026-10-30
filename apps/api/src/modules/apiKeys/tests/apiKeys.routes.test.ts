import express, { type Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startTestDatabase,
  stopTestDatabase
} from "../../../tests/helpers/testDatabase.js";
import { createAuthedUser } from "../../../tests/helpers/authTestUser.js";

let app: Express;
let testApp: Express;
let prisma: typeof import("../../../db/prisma.js").prisma;

async function createKey(token: string, body: Record<string, unknown> = { name: "CI" }) {
  const res = await request(app)
    .post("/users/me/api-keys")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
  return res;
}

describe("/users/me/api-keys routes", () => {
  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../../app.js"));
    ({ prisma } = await import("../../../db/prisma.js"));
    const { requireCredential, requireScope } = await import("../../../middleware/credential.js");

    testApp = express();
    testApp.get("/me", requireCredential, requireScope("read"), async (req, res) => {
      const transactions = await prisma.transaction.findMany({ where: { userId: req.user!.id } });
      res.json({ userId: req.user!.id, count: transactions.length });
    });
    testApp.post("/write", requireCredential, requireScope("write"), (_req, res) => {
      res.json({ ok: true });
    });
    testApp.use(
      (err: { statusCode?: number }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(err.statusCode ?? 500).json({});
      }
    );
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  it("creates (secret once), lists without secrets, and revokes", async () => {
    const { token } = await createAuthedUser(app);

    const created = await createKey(token);
    expect(created.status).toBe(201);
    expect(created.body.key).toMatch(/^fl_/);
    expect(created.body.apiKey.scopes).toEqual(["read"]);
    expect(created.body.apiKey.expiresAt).toEqual(expect.any(String));
    expect(created.body.apiKey).not.toHaveProperty("secretHash");

    const list = await request(app).get("/users/me/api-keys").set("Authorization", `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.apiKeys).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(created.body.key);
    expect(list.body.apiKeys[0]).not.toHaveProperty("secretHash");

    const id = created.body.apiKey.id;
    const revoke = () =>
      request(app).delete(`/users/me/api-keys/${id}`).set("Authorization", `Bearer ${token}`);
    expect((await revoke()).status).toBe(204);
    expect((await revoke()).status).toBe(204);
  });

  it("validates input and supports never lifetime", async () => {
    const { token } = await createAuthedUser(app);

    expect((await createKey(token, { name: "" })).status).toBe(400);
    expect((await createKey(token, { name: "x", lifetime: "5d" })).status).toBe(400);
    const never = await createKey(token, { name: "x", lifetime: "never", allowWrite: true });
    expect(never.body.apiKey.expiresAt).toBeNull();
    expect(never.body.apiKey.scopes).toEqual(["read", "write"]);
  });

  it("hides another user's key behind a 404", async () => {
    const a = await createAuthedUser(app);
    const b = await createAuthedUser(app);
    const created = await createKey(a.token);

    const res = await request(app)
      .delete(`/users/me/api-keys/${created.body.apiKey.id}`)
      .set("Authorization", `Bearer ${b.token}`);
    expect(res.status).toBe(404);

    const list = await request(app).get("/users/me/api-keys").set("Authorization", `Bearer ${b.token}`);
    expect(list.body.apiKeys).toHaveLength(0);
    const row = await prisma.apiKey.findUnique({ where: { id: created.body.apiKey.id } });
    expect(row?.revokedAt).toBeNull();
  });

  it("rejects an fl_ bearer on key management with 401", async () => {
    const { token } = await createAuthedUser(app);
    const { body } = await createKey(token);

    const res = await request(app).get("/users/me/api-keys").set("Authorization", `Bearer ${body.key}`);
    expect(res.status).toBe(401);
    const post = await request(app)
      .post("/users/me/api-keys")
      .set("Authorization", `Bearer ${body.key}`)
      .send({ name: "x" });
    expect(post.status).toBe(401);
  });

  it("deletes keys when the user is deleted", async () => {
    const { token, user } = await createAuthedUser(app);
    const { body } = await createKey(token);

    await prisma.user.delete({ where: { id: user.id } });

    expect(await prisma.apiKey.count({ where: { userId: user.id } })).toBe(0);
    expect((await request(testApp).get("/me").set("Authorization", `Bearer ${body.key}`)).status).toBe(401);
  });

  describe("requireCredential / requireScope (test-only router)", () => {
    it("acts as the owner and isolates users", async () => {
      const a = await createAuthedUser(app);
      const b = await createAuthedUser(app);
      const keyA = (await createKey(a.token)).body.key;

      const res = await request(testApp).get("/me").set("Authorization", `Bearer ${keyA}`);
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(a.user.id);
      expect(res.body.userId).not.toBe(b.user.id);
    });

    it("returns 401 once the key is revoked or expired", async () => {
      const { token } = await createAuthedUser(app);
      const revoked = (await createKey(token)).body;
      const expired = (await createKey(token)).body;

      expect((await request(testApp).get("/me").set("Authorization", `Bearer ${revoked.key}`)).status).toBe(200);
      await request(app).delete(`/users/me/api-keys/${revoked.apiKey.id}`).set("Authorization", `Bearer ${token}`);
      expect((await request(testApp).get("/me").set("Authorization", `Bearer ${revoked.key}`)).status).toBe(401);

      await prisma.apiKey.update({
        where: { id: expired.apiKey.id },
        data: { expiresAt: new Date(Date.now() - 1000) }
      });
      expect((await request(testApp).get("/me").set("Authorization", `Bearer ${expired.key}`)).status).toBe(401);
    });

    it("rejects a web JWT and gives a read key 403 on a write route", async () => {
      const { token } = await createAuthedUser(app);
      const read = (await createKey(token)).body.key;
      const write = (await createKey(token, { name: "w", allowWrite: true })).body.key;

      expect((await request(testApp).get("/me").set("Authorization", `Bearer ${token}`)).status).toBe(401);
      expect((await request(testApp).post("/write").set("Authorization", `Bearer ${read}`)).status).toBe(403);
      expect((await request(testApp).post("/write").set("Authorization", `Bearer ${write}`)).status).toBe(200);
    });
  });
});
