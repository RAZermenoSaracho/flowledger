import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../read.service.js", () => ({
  getEditableCategory: vi.fn()
}));

const { getEditableCategory } = await import("../read.service.js");
const getEditableCategoryMock = vi.mocked(getEditableCategory);

const { deleteCategory } = await import("../delete.service.js");

describe("deleteCategory", () => {
  it("deletes the category after confirming edit access", async () => {
    getEditableCategoryMock.mockResolvedValue({ id: "cat-1" } as never);
    prismaMock.category.delete.mockResolvedValue({} as never);

    await deleteCategory("user-1", "cat-1");

    expect(getEditableCategoryMock).toHaveBeenCalledWith("user-1", "cat-1");
    expect(prismaMock.category.delete).toHaveBeenCalledWith({
      where: { id: "cat-1" }
    });
  });

  it("propagates a not-found/authorization error without deleting", async () => {
    getEditableCategoryMock.mockRejectedValue(new Error("Category not found"));

    await expect(deleteCategory("user-1", "missing")).rejects.toThrow(
      "Category not found"
    );
    expect(prismaMock.category.delete).not.toHaveBeenCalled();
  });
});
