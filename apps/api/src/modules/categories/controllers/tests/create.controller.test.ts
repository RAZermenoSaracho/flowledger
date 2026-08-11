import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({
  createCategory: vi.fn()
}));

const { createCategory } = await import("../../services/create.service.js");
const { postCategory } = await import("../create.controller.js");

describe("postCategory", () => {
  it("creates the category for the authenticated user and responds 201", async () => {
    vi.mocked(createCategory).mockResolvedValue({ id: "cat-1" } as never);
    const res = mockResponse();

    await postCategory(
      mockRequest({ body: { name: "Groceries", type: "expense" } }),
      res
    );

    expect(createCategory).toHaveBeenCalledWith("user-1", {
      name: "Groceries",
      type: "expense"
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ category: { id: "cat-1" } });
  });
});
