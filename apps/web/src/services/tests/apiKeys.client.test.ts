import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../tests/mocks/server";
import { createApiKey, listApiKeys, revokeApiKey } from "../apiKeys.client";

const API_URL = "http://localhost:4000";
const apiKey = {
  id: "k1",
  name: "Claude",
  hint: "abcd",
  scopes: ["read"],
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z"
};

describe("apiKeys.client", () => {
  it("creates a key with the posted body", async () => {
    let body: unknown;
    server.use(
      http.post(`${API_URL}/users/me/api-keys`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ apiKey, key: "fl_secret" }, { status: 201 });
      })
    );
    const result = await createApiKey({ name: "Claude", allowWrite: false, lifetime: "1m" });
    expect(body).toEqual({ name: "Claude", allowWrite: false, lifetime: "1m" });
    expect(result.key).toBe("fl_secret");
  });

  it("lists keys", async () => {
    server.use(http.get(`${API_URL}/users/me/api-keys`, () => HttpResponse.json({ apiKeys: [apiKey] })));
    expect((await listApiKeys()).apiKeys).toHaveLength(1);
  });

  it("revokes a key via DELETE and resolves on 204", async () => {
    let called = false;
    server.use(
      http.delete(`${API_URL}/users/me/api-keys/k1`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    await expect(revokeApiKey("k1")).resolves.toBeUndefined();
    expect(called).toBe(true);
  });
});
