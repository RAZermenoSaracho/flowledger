import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/delete.service.js", () => ({ revokeApiKey: vi.fn() }));

const { revokeApiKey } = await import("../../services/delete.service.js");
const { deleteApiKey } = await import("../delete.controller.js");

describe("deleteApiKey", () => {
  it("revokes and responds 204", async () => {
    const res = mockResponse();

    await deleteApiKey(mockRequest({ params: { id: "k1" } } as never), res);

    expect(revokeApiKey).toHaveBeenCalledWith("user-1", "k1");
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalled();
  });
});
