import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/delete.service.js", () => ({
  deleteCategory: vi.fn()
}));

const { deleteCategory } = await import("../../services/delete.service.js");
const { deleteCategoryController } = await import("../delete.controller.js");

describe("deleteCategoryController", () => {
  it("deletes the category and responds 204", async () => {
    vi.mocked(deleteCategory).mockResolvedValue(undefined);
    const res = mockResponse();

    await deleteCategoryController(
      mockRequest({ params: { id: "cat-1" } }),
      res
    );

    expect(deleteCategory).toHaveBeenCalledWith("user-1", "cat-1");
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });

  it("throws a 404 when no id param is present", async () => {
    await expect(
      deleteCategoryController(mockRequest({ params: {} }), mockResponse())
    ).rejects.toThrow("Category not found");
  });
});
