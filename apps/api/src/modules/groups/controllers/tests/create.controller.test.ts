import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/create.service.js", () => ({
  addGroupCategory: vi.fn(),
  addGroupMember: vi.fn(),
  createGroup: vi.fn()
}));

const { addGroupCategory, addGroupMember, createGroup } = await import(
  "../../services/create.service.js"
);
const { postGroup, postGroupCategory, postGroupMember } = await import(
  "../create.controller.js"
);

describe("postGroup", () => {
  it("creates the group and responds 201", async () => {
    vi.mocked(createGroup).mockResolvedValue({ id: "group-1" } as never);
    const res = mockResponse();

    await postGroup(mockRequest({ body: { name: "Roommates" } }), res);

    expect(createGroup).toHaveBeenCalledWith("user-1", { name: "Roommates" });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ group: { id: "group-1" } });
  });
});

describe("postGroupMember", () => {
  it("adds the member and responds 201", async () => {
    vi.mocked(addGroupMember).mockResolvedValue({ id: "member-1" } as never);
    const res = mockResponse();

    await postGroupMember(
      mockRequest({ params: { id: "group-1" }, body: { userId: "user-2" } }),
      res
    );

    expect(addGroupMember).toHaveBeenCalledWith("user-1", "group-1", "user-2");
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("throws a 404 with no group id param", async () => {
    await expect(
      postGroupMember(mockRequest({ params: {} }), mockResponse())
    ).rejects.toThrow("Group not found");
  });
});

describe("postGroupCategory", () => {
  it("adds the category and responds 201", async () => {
    vi.mocked(addGroupCategory).mockResolvedValue({ id: "cat-1" } as never);
    const res = mockResponse();

    await postGroupCategory(
      mockRequest({ params: { id: "group-1" }, body: { name: "Rent", type: "expense" } }),
      res
    );

    expect(addGroupCategory).toHaveBeenCalledWith("user-1", "group-1", {
      name: "Rent",
      type: "expense"
    });
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
