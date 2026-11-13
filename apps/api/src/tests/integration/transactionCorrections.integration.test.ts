import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Express } from "express";
import type { Server } from "node:http";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../helpers/authTestUser.js";
import { startTestDatabase, stopTestDatabase } from "../helpers/testDatabase.js";
import { loopbackOrigin } from "../helpers/loopback.js";

// Cross-module integration test: needs Docker (see CLAUDE.local.md).
let app: Express;
let server: Server;
let baseUrl: string;
let prisma: (typeof import("../../db/prisma.js"))["prisma"];

type AuthedUser = Awaited<ReturnType<typeof createAuthedUser>>;
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

async function mintWriteKey(user: AuthedUser) {
  const response = await request(app)
    .post("/users/me/api-keys")
    .set(bearer(user.token))
    .send({ name: "corrections", allowWrite: true, lifetime: "1m" });
  return response.body.key as string;
}

async function createActor() {
  const user = await createAuthedUser(app);
  const usd = await request(app).post("/accounts").set(bearer(user.token))
    .send({ name: "USD", type: "checking", currency: "USD", initialBalance: "1000" });
  const mxn = await request(app).post("/accounts").set(bearer(user.token))
    .send({ name: "MXN", type: "checking", currency: "MXN" });
  const key = await mintWriteKey(user);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${key}` } }
    })
  );
  const transfer = await request(app).post("/transactions").set(bearer(user.token)).send({
    name: "Move", type: "transfer", amount: "100", date: "2024-01-15",
    accountId: usd.body.account.id, transferToAccountId: mxn.body.account.id,
    executionCurrency: "USD", destinationAmount: "1700"
  });
  expect(transfer.status, JSON.stringify(transfer.body)).toBe(201);
  return { user, key, client, transactionId: transfer.body.transaction.id as string };
}

describe("transaction corrections integration", () => {
  let a: Awaited<ReturnType<typeof createActor>>;
  let b: Awaited<ReturnType<typeof createActor>>;

  beforeAll(async () => {
    await startTestDatabase();
    ({ app } = await import("../../app.js"));
    ({ prisma } = await import("../../db/prisma.js"));
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    baseUrl = loopbackOrigin(server);
    a = await createActor();
    b = await createActor();
  }, 180_000);

  afterAll(async () => {
    await a?.client.close();
    await b?.client.close();
    await new Promise((resolve) => server?.close(resolve));
    await prisma?.$disconnect();
    await stopTestDatabase();
  });

  const rows = (userId: string, transactionId: string) =>
    prisma.transactionCorrection.findMany({ where: { userId, transactionId }, orderBy: { createdAt: "asc" } });

  it("records one row for a /v1 financial edit and none for a description-only edit", async () => {
    const res = await request(app).put(`/v1/transactions/${a.transactionId}`).set(bearer(a.key))
      .send({ destinationAmount: "1690" });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.transaction.destinationAmount).toBe("1690");

    const rename = await request(app).put(`/v1/transactions/${a.transactionId}`).set(bearer(a.key))
      .send({ name: "Renamed" });
    expect(rename.status).toBe(200);

    const history = await rows(a.user.user.id, a.transactionId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ action: "update", corrected: expect.objectContaining({ destinationAmount: "1690" }) });
    expect(history[0]!.previous).toMatchObject({ destinationAmount: "1700", amount: "100" });
  });

  it("records one row for an MCP financial edit", async () => {
    const result = (await a.client.callTool({
      name: "update_transaction",
      arguments: { id: a.transactionId, destinationAmount: "1680" }
    })) as { isError?: boolean };
    expect(result.isError).toBeFalsy();

    const history = await rows(a.user.user.id, a.transactionId);
    expect(history).toHaveLength(2);
    expect(history[1]!.corrected).toMatchObject({ destinationAmount: "1680" });
  });

  it("rejects an amount edit that does not restate the cross-currency destinationAmount", async () => {
    const res = await request(app).put(`/v1/transactions/${a.transactionId}`).set(bearer(a.key))
      .send({ amount: "90" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("destinationAmount");
    expect(await rows(a.user.user.id, a.transactionId)).toHaveLength(2);
  });

  it("keeps a deletion row after the transaction is gone and shows another user none", async () => {
    const res = await request(app).delete(`/v1/transactions/${a.transactionId}`).set(bearer(a.key));
    expect(res.status).toBe(204);
    expect(await prisma.transaction.findUnique({ where: { id: a.transactionId } })).toBeNull();

    const history = await rows(a.user.user.id, a.transactionId);
    expect(history).toHaveLength(3);
    expect(history[2]).toMatchObject({ action: "delete", corrected: null });
    expect(history[2]!.previous).toMatchObject({ destinationAmount: "1680" });

    expect(await rows(b.user.user.id, a.transactionId)).toHaveLength(0);
  });
});
