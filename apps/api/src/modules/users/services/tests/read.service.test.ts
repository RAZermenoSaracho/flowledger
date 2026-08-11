import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { getCurrentUser, searchUsers } from "../read.service.js";

describe("searchUsers", () => {
  it("excludes the caller and matches name/email case-insensitively", async () => {
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-2", name: "Ada", email: "ada@example.com" }
    ] as never);
    prismaMock.user.count.mockResolvedValue(1);

    const result = await searchUsers("user-1", "ada", 10);

    const call = prismaMock.user.findMany.mock.calls[0]?.[0] as { where: unknown };
    expect(JSON.stringify(call.where)).toContain("user-1");
    expect(result).toEqual([{ id: "user-2", name: "Ada", email: "ada@example.com" }]);
  });
});

describe("getCurrentUser", () => {
  it("returns the user by id", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1" } as never);

    expect(await getCurrentUser("user-1")).toMatchObject({ id: "user-1" });
  });
});
