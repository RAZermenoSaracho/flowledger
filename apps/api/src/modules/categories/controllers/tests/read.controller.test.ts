import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  listCategories: vi.fn()
}));

const { listCategories } = await import("../../services/read.service.js");
const { getCategories } = await import("../read.controller.js");

describe("getCategories", () => {
  it("passes scope filters and the query param through to the service", async () => {
    vi.mocked(listCategories).mockResolvedValue([{ id: "cat-1" }] as never);
    const res = mockResponse();

    await getCategories(
      mockRequest({ query: { groupId: "group-1", scope: "all", query: "{}" } }),
      res
    );

    expect(listCategories).toHaveBeenCalledWith(
      "user-1",
      { groupId: "group-1", scope: "all" },
      "{}"
    );
    expect(res.json).toHaveBeenCalledWith({ categories: [{ id: "cat-1" }] });
  });
});
