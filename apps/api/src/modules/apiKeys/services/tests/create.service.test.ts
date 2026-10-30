import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { createApiKey } from "../create.service.js";

describe("createApiKey", () => {
  it("stores only the hash and returns the plaintext key once", async () => {
    prismaMock.apiKey.create.mockResolvedValue({ id: "k1" } as never);

    const result = await createApiKey("user-1", {
      name: "CI",
      allowWrite: false,
      lifetime: "never"
    });

    const data = prismaMock.apiKey.create.mock.calls[0]![0].data;
    expect(result.key).toMatch(/^fl_/);
    expect(data).toMatchObject({ userId: "user-1", name: "CI", scopes: ["read"], expiresAt: null });
    expect(JSON.stringify(data)).not.toContain(result.key);
    expect(prismaMock.apiKey.create.mock.calls[0]![0].select).not.toHaveProperty("secretHash");
  });

  it("grants read+write and an expiry when requested", async () => {
    prismaMock.apiKey.create.mockResolvedValue({ id: "k1" } as never);

    await createApiKey("user-1", { name: "CI", allowWrite: true, lifetime: "1y" });

    const data = prismaMock.apiKey.create.mock.calls[0]![0].data;
    expect(data.scopes).toEqual(["read", "write"]);
    expect(data.expiresAt).toBeInstanceOf(Date);
  });
});
