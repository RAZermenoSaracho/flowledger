import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { archiveAccount, restoreAccount, updateAccount } from "../update.service.js";

describe("updateAccount", () => {
  it("updates the account owned by the user", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1" } as never);
    prismaMock.account.update.mockResolvedValue({} as never);

    await updateAccount("user-1", "acc-1", { name: "Renamed" });

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { name: "Renamed" }
    });
  });

  it("throws a 404 when the account isn't owned by the user", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);

    await expect(
      updateAccount("user-1", "not-mine", { name: "Renamed" })
    ).rejects.toThrow("Account not found");
  });
});

describe("archiveAccount", () => {
  it("marks the account archived with a timestamp", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1" } as never);
    prismaMock.account.update.mockResolvedValue({} as never);

    await archiveAccount("user-1", "acc-1");

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { isArchived: true, archivedAt: expect.any(Date) }
    });
  });

  it("throws a 404 when the account isn't owned by the user", async () => {
    prismaMock.account.findFirst.mockResolvedValue(null);
    await expect(archiveAccount("user-1", "not-mine")).rejects.toThrow(
      "Account not found"
    );
  });
});

describe("restoreAccount", () => {
  it("clears the archived flag and timestamp", async () => {
    prismaMock.account.findFirst.mockResolvedValue({ id: "acc-1" } as never);
    prismaMock.account.update.mockResolvedValue({} as never);

    await restoreAccount("user-1", "acc-1");

    expect(prismaMock.account.update).toHaveBeenCalledWith({
      where: { id: "acc-1" },
      data: { isArchived: false, archivedAt: null }
    });
  });
});
