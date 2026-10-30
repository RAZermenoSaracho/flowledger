import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { revokeApiKey } from "../delete.service.js";

describe("revokeApiKey", () => {
  it("revokes with ownership in the where clause", async () => {
    prismaMock.apiKey.updateMany.mockResolvedValue({ count: 1 });

    await revokeApiKey("user-1", "k1");

    expect(prismaMock.apiKey.updateMany.mock.calls[0]![0].where).toEqual({
      id: "k1",
      userId: "user-1",
      revokedAt: null
    });
  });

  it("is idempotent when already revoked", async () => {
    prismaMock.apiKey.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.apiKey.findFirst.mockResolvedValue({ id: "k1" } as never);

    await expect(revokeApiKey("user-1", "k1")).resolves.toBeUndefined();
  });

  it("404s for another user's or missing key", async () => {
    prismaMock.apiKey.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.apiKey.findFirst.mockResolvedValue(null);

    await expect(revokeApiKey("user-2", "k1")).rejects.toMatchObject({ statusCode: 404 });
  });
});
