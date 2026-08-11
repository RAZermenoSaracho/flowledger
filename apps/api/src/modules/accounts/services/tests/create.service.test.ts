import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { createAccount } from "../create.service.js";

describe("createAccount", () => {
  it("creates the account scoped to the owning user", async () => {
    prismaMock.account.create.mockResolvedValue({ id: "acc-1" } as never);

    await createAccount("user-1", { name: "Checking", type: "checking" });

    expect(prismaMock.account.create).toHaveBeenCalledWith({
      data: { name: "Checking", type: "checking", userId: "user-1" }
    });
  });
});
