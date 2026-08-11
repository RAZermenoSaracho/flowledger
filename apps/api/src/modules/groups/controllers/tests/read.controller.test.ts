import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  getGroupById: vi.fn(),
  listGroups: vi.fn()
}));

const { getGroupById, listGroups } = await import("../../services/read.service.js");
const { getGroup, getGroups } = await import("../read.controller.js");

describe("getGroups", () => {
  it("lists the caller's groups", async () => {
    vi.mocked(listGroups).mockResolvedValue([{ id: "group-1" }] as never);
    const res = mockResponse();

    await getGroups(mockRequest({ query: { query: "{}" } }), res);

    expect(listGroups).toHaveBeenCalledWith("user-1", "{}");
    expect(res.json).toHaveBeenCalledWith({ groups: [{ id: "group-1" }] });
  });
});

describe("getGroup", () => {
  it("fetches one group by id", async () => {
    vi.mocked(getGroupById).mockResolvedValue({ id: "group-1" } as never);
    const res = mockResponse();

    await getGroup(mockRequest({ params: { id: "group-1" } }), res);

    expect(getGroupById).toHaveBeenCalledWith("user-1", "group-1");
    expect(res.json).toHaveBeenCalledWith({ group: { id: "group-1" } });
  });
});
