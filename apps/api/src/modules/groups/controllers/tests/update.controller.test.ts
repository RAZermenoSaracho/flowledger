import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({
  archiveGroup: vi.fn(),
  restoreGroup: vi.fn(),
  updateGroup: vi.fn()
}));

const { archiveGroup, restoreGroup, updateGroup } = await import(
  "../../services/update.service.js"
);
const { postGroupArchive, postGroupRestore, putGroup } = await import(
  "../update.controller.js"
);

describe("putGroup", () => {
  it("updates the group", async () => {
    vi.mocked(updateGroup).mockResolvedValue({ id: "group-1" } as never);
    const res = mockResponse();

    await putGroup(
      mockRequest({ params: { id: "group-1" }, body: { name: "Renamed" } }),
      res
    );

    expect(updateGroup).toHaveBeenCalledWith("user-1", "group-1", {
      name: "Renamed"
    });
    expect(res.json).toHaveBeenCalledWith({ group: { id: "group-1" } });
  });

  it("throws a 404 with no id param", async () => {
    await expect(
      putGroup(mockRequest({ params: {} }), mockResponse())
    ).rejects.toThrow("Group not found");
  });
});

describe("postGroupArchive", () => {
  it("archives the group", async () => {
    vi.mocked(archiveGroup).mockResolvedValue({ id: "group-1" } as never);
    const res = mockResponse();

    await postGroupArchive(mockRequest({ params: { id: "group-1" } }), res);

    expect(archiveGroup).toHaveBeenCalledWith("user-1", "group-1");
  });
});

describe("postGroupRestore", () => {
  it("restores the group", async () => {
    vi.mocked(restoreGroup).mockResolvedValue({ id: "group-1" } as never);
    const res = mockResponse();

    await postGroupRestore(mockRequest({ params: { id: "group-1" } }), res);

    expect(restoreGroup).toHaveBeenCalledWith("user-1", "group-1");
  });
});
