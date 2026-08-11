import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({
  archiveCategory: vi.fn(),
  restoreCategory: vi.fn(),
  updateCategory: vi.fn()
}));

const { archiveCategory, restoreCategory, updateCategory } = await import(
  "../../services/update.service.js"
);
const { postCategoryArchive, postCategoryRestore, putCategory } = await import(
  "../update.controller.js"
);

describe("putCategory", () => {
  it("updates the category and responds with it", async () => {
    vi.mocked(updateCategory).mockResolvedValue({ id: "cat-1" } as never);
    const res = mockResponse();

    await putCategory(
      mockRequest({ params: { id: "cat-1" }, body: { name: "Renamed" } }),
      res
    );

    expect(updateCategory).toHaveBeenCalledWith("user-1", "cat-1", {
      name: "Renamed"
    });
    expect(res.json).toHaveBeenCalledWith({ category: { id: "cat-1" } });
  });

  it("throws a 404 with no id param", async () => {
    await expect(
      putCategory(mockRequest({ params: {} }), mockResponse())
    ).rejects.toThrow("Category not found");
  });
});

describe("postCategoryArchive", () => {
  it("archives the category and responds with it", async () => {
    vi.mocked(archiveCategory).mockResolvedValue({ id: "cat-1", isArchived: true } as never);
    const res = mockResponse();

    await postCategoryArchive(mockRequest({ params: { id: "cat-1" } }), res);

    expect(archiveCategory).toHaveBeenCalledWith("user-1", "cat-1");
    expect(res.json).toHaveBeenCalledWith({
      category: { id: "cat-1", isArchived: true }
    });
  });
});

describe("postCategoryRestore", () => {
  it("restores the category and responds with it", async () => {
    vi.mocked(restoreCategory).mockResolvedValue({ id: "cat-1", isArchived: false } as never);
    const res = mockResponse();

    await postCategoryRestore(mockRequest({ params: { id: "cat-1" } }), res);

    expect(restoreCategory).toHaveBeenCalledWith("user-1", "cat-1");
    expect(res.json).toHaveBeenCalledWith({
      category: { id: "cat-1", isArchived: false }
    });
  });
});
