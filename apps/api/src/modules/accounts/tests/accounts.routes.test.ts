import type { Express } from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthedUser } from "../../../tests/helpers/authTestUser.js";
import {
  startTestDatabase,
  stopTestDatabase
} from "../../../tests/helpers/testDatabase.js";

// NOT run in this sandbox (no Docker) — see docs/TESTING.md.
let app: Express;

// One startTestDatabase()/app import for the whole file — app.js's Prisma
// client (src/db/prisma.ts) is a module-level singleton, so re-importing it
// per describe block doesn't give each block a fresh connection; it just
// leaves later blocks talking to whichever container the first import
// bound to, which earlier blocks' own afterAll may have already stopped.
beforeAll(async () => {
  await startTestDatabase();
  ({ app } = await import("../../../app.js"));
}, 120_000);

afterAll(async () => {
  await stopTestDatabase();
});

describe("/accounts routes", () => {
  it("requires authentication", async () => {
    const response = await request(app).get("/accounts");
    expect(response.status).toBe(401);
  });

  it("creates, lists, updates, archives, restores, and deletes an account", async () => {
    const { token } = await createAuthedUser(app);
    const auth = (req: request.Test) => req.set("Authorization", `Bearer ${token}`);

    const createResponse = await auth(request(app).post("/accounts")).send({
      name: "Checking",
      type: "checking"
    });
    expect(createResponse.status).toBe(201);
    const accountId = createResponse.body.account.id as string;

    const listResponse = await auth(request(app).get("/accounts"));
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.accounts).toHaveLength(1);
    expect(listResponse.body.accounts[0]).toMatchObject({ source: "manual" });

    const updateResponse = await auth(
      request(app).put(`/accounts/${accountId}`)
    ).send({ name: "Primary Checking" });
    expect(updateResponse.status).toBe(200);

    const archiveResponse = await auth(
      request(app).post(`/accounts/${accountId}/archive`)
    );
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.account.isArchived).toBe(true);

    const restoreResponse = await auth(
      request(app).post(`/accounts/${accountId}/restore`)
    );
    expect(restoreResponse.status).toBe(200);

    const deleteResponse = await auth(
      request(app).delete(`/accounts/${accountId}`)
    );
    expect(deleteResponse.status).toBe(204);
  });
});

describe("/providers routes", () => {
  it("requires authentication for /providers/connectors", async () => {
    const response = await request(app).get("/providers/connectors");
    expect(response.status).toBe(401);
  });

  it("lists the registered syncfy connector", async () => {
    const { token } = await createAuthedUser(app);

    const response = await request(app)
      .get("/providers/connectors")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.connectors).toEqual(
      expect.arrayContaining([expect.objectContaining({ provider: "syncfy" })])
    );
  });
});

describe("/providers/webhooks routes", () => {
  it("does not require authentication and always responds 200", async () => {
    const response = await request(app)
      .post("/providers/webhooks/syncfy")
      .send({ rid: "rid-1", events: [] });

    expect(response.status).toBe(200);
  });

  it("responds 400 for an unregistered provider on the health check", async () => {
    const response = await request(app).get("/providers/webhooks/unknown-provider");
    expect(response.status).toBe(404);
  });
});
