import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/delete.service.js", () => ({ deleteModel: vi.fn() }));

const { deleteModel } = await import("../../services/delete.service.js");
const { deleteModelController } = await import("../delete.controller.js");

describe("deleteModelController", () => {
  it("deletes and responds 204", async () => {
    const res = mockResponse();
    await deleteModelController(mockRequest({ params: { id: "m1" } }), res);
    expect(deleteModel).toHaveBeenCalledWith("user-1", "m1");
    expect(res.status).toHaveBeenCalledWith(204);
  });
});
