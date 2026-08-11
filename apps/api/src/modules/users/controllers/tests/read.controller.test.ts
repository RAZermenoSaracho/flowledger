import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  getCurrentUser: vi.fn(),
  searchUsers: vi.fn()
}));

const { getCurrentUser, searchUsers } = await import("../../services/read.service.js");
const { getMe, getUserSearch } = await import("../read.controller.js");

describe("getUserSearch", () => {
  it("searches users, excluding the requester", async () => {
    vi.mocked(searchUsers).mockResolvedValue([{ id: "user-2" }] as never);
    const res = mockResponse();

    await getUserSearch(mockRequest({ query: { q: "ada", limit: 10 } } as never), res);

    expect(searchUsers).toHaveBeenCalledWith("user-1", "ada", 10);
    expect(res.json).toHaveBeenCalledWith({ users: [{ id: "user-2" }] });
  });
});

describe("getMe", () => {
  it("returns the caller's public profile", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: "user-1",
      email: "ada@example.com",
      passwordHash: "secret"
    } as never);
    const res = mockResponse();

    await getMe(mockRequest(), res);

    expect(res.json).toHaveBeenCalledWith({
      user: { id: "user-1", email: "ada@example.com" }
    });
  });
});
