import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { deleteAccount } from "../delete.service.js";

describe("deleteAccount", () => {
  it("deletes the account owned by the user", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1" } as never);
    prismaMock.account.delete.mockResolvedValue({} as never);

    await deleteAccount("user-1", "acc-1");

    expect(prismaMock.account.findFirst).toHaveBeenCalledWith({
      where: { id: "acc-1", userId: "user-1" }
    });
    expect(prismaMock.account.delete).toHaveBeenCalledWith({
      where: { id: "acc-1" }
    });
  });

  it("throws a 404 when the account isn't owned by the user", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(deleteAccount("user-1", "not-mine")).rejects.toThrow(
      "Account not found"
    );
    expect(prismaMock.account.delete).not.toHaveBeenCalled();
  });
});
