import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  countUnreadNotifications: vi.fn(),
  listNotifications: vi.fn()
}));

const { countUnreadNotifications, listNotifications } = await import(
  "../../services/read.service.js"
);
const { getNotifications, getUnreadCount } = await import("../read.controller.js");

describe("getNotifications", () => {
  it("returns the caller's notifications", async () => {
    vi.mocked(listNotifications).mockResolvedValue([{ id: "n1" }] as never);
    const res = mockResponse();

    await getNotifications(mockRequest(), res);

    expect(listNotifications).toHaveBeenCalledWith("user-1");
    expect(res.json).toHaveBeenCalledWith({ notifications: [{ id: "n1" }] });
  });
});

describe("getUnreadCount", () => {
  it("returns the unread count", async () => {
    vi.mocked(countUnreadNotifications).mockResolvedValue(3);
    const res = mockResponse();

    await getUnreadCount(mockRequest(), res);

    expect(res.json).toHaveBeenCalledWith({ count: 3 });
  });
});
