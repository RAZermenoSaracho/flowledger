import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/delete.service.js", () => ({
  deleteGroup: vi.fn(),
  removeGroupMember: vi.fn()
}));

const { deleteGroup, removeGroupMember } = await import(
  "../../services/delete.service.js"
);
const { deleteGroupController, deleteGroupMember } = await import(
  "../delete.controller.js"
);

describe("deleteGroupController", () => {
  it("deletes the group and responds 204", async () => {
    vi.mocked(deleteGroup).mockResolvedValue(undefined);
    const res = mockResponse();

    await deleteGroupController(mockRequest({ params: { id: "group-1" } }), res);

    expect(deleteGroup).toHaveBeenCalledWith("user-1", "group-1");
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("throws a 404 with no id param", async () => {
    await expect(
      deleteGroupController(mockRequest({ params: {} }), mockResponse())
    ).rejects.toThrow("Group not found");
  });
});

describe("deleteGroupMember", () => {
  it("removes the member and responds 204", async () => {
    vi.mocked(removeGroupMember).mockResolvedValue(undefined);
    const res = mockResponse();

    await deleteGroupMember(
      mockRequest({ params: { id: "group-1", userId: "user-2" } }),
      res
    );

    expect(removeGroupMember).toHaveBeenCalledWith("user-1", "group-1", "user-2");
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it("throws a 404 when either param is missing", async () => {
    await expect(
      deleteGroupMember(mockRequest({ params: { id: "group-1" } }), mockResponse())
    ).rejects.toThrow("Group not found");
  });
});
