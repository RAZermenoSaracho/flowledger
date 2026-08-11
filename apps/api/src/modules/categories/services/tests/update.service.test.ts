import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../read.service.js", () => ({
  getEditableCategory: vi.fn()
}));

const { getEditableCategory } = await import("../read.service.js");
const getEditableCategoryMock = vi.mocked(getEditableCategory);

const { archiveCategory, restoreCategory, updateCategory } = await import(
  "../update.service.js"
);

describe("updateCategory", () => {
  it("updates the category after confirming edit access", async () => {
    getEditableCategoryMock.mockResolvedValue({ id: "cat-1" } as never);
    prismaMock.category.update.mockResolvedValue({} as never);

    await updateCategory("user-1", "cat-1", { name: "Renamed" });

    expect(prismaMock.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: { name: "Renamed" }
    });
  });
});

describe("archiveCategory", () => {
  it("marks the category archived with a timestamp", async () => {
    getEditableCategoryMock.mockResolvedValue({ id: "cat-1" } as never);
    prismaMock.category.update.mockResolvedValue({} as never);

    await archiveCategory("user-1", "cat-1");

    expect(prismaMock.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: { isArchived: true, archivedAt: expect.any(Date) }
    });
  });
});

describe("restoreCategory", () => {
  it("clears the archived flag and timestamp", async () => {
    getEditableCategoryMock.mockResolvedValue({ id: "cat-1" } as never);
    prismaMock.category.update.mockResolvedValue({} as never);

    await restoreCategory("user-1", "cat-1");

    expect(prismaMock.category.update).toHaveBeenCalledWith({
      where: { id: "cat-1" },
      data: { isArchived: false, archivedAt: null }
    });
  });
});
