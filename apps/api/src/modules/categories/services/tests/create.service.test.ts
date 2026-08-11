import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { createCategory } from "../create.service.js";

describe("createCategory", () => {
  it("creates a personal category owned by the given user", async () => {
    prismaMock.category.create.mockResolvedValue({
      id: "category-1",
      name: "Groceries",
      type: "expense",
      color: null,
      groupId: null
    } as never);

    await createCategory("user-1", { name: "Groceries", type: "expense" });

    expect(prismaMock.category.create).toHaveBeenCalledWith({
      data: {
        name: "Groceries",
        type: "expense",
        groupId: null,
        users: { create: { userId: "user-1" } }
      }
    });
  });

  it("passes through an optional color", async () => {
    prismaMock.category.create.mockResolvedValue({} as never);

    await createCategory("user-1", {
      name: "Rent",
      type: "expense",
      color: "#ff0000"
    });

    expect(prismaMock.category.create).toHaveBeenCalledWith({
      data: {
        name: "Rent",
        type: "expense",
        color: "#ff0000",
        groupId: null,
        users: { create: { userId: "user-1" } }
      }
    });
  });
});
