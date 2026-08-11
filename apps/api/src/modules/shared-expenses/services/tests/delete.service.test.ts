import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { deleteSharedExpense } from "../delete.service.js";

describe("deleteSharedExpense", () => {
  it("throws a 404 when not owned by the user", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue(null);

    await expect(deleteSharedExpense("user-1", "se-1")).rejects.toThrow(
      "Shared expense not found"
    );
  });

  it("deletes the shared expense when owned", async () => {
    prismaMock.sharedExpense.findFirst.mockResolvedValue({ id: "se-1" } as never);
    prismaMock.sharedExpense.delete.mockResolvedValue({} as never);

    await deleteSharedExpense("user-1", "se-1");

    expect(prismaMock.sharedExpense.delete).toHaveBeenCalledWith({
      where: { id: "se-1" }
    });
  });
});
