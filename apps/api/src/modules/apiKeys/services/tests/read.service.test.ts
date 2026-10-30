import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { listApiKeys } from "../read.service.js";

describe("listApiKeys", () => {
  it("scopes by user and never selects secretHash", async () => {
    prismaMock.apiKey.findMany.mockResolvedValue([] as never);

    await listApiKeys("user-1");

    const args = prismaMock.apiKey.findMany.mock.calls[0]![0]!;
    expect(args.where).toEqual({ userId: "user-1" });
    expect(args.select).not.toHaveProperty("secretHash");
  });
});
