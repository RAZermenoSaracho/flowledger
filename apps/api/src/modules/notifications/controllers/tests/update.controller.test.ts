import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn()
}));

const { markAllNotificationsRead, markNotificationRead } = await import(
  "../../services/update.service.js"
);
const { markAllRead, markRead } = await import("../update.controller.js");

describe("markAllRead", () => {
  it("marks every notification read and responds 204", async () => {
    vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined);
    const res = mockResponse();

    await markAllRead(mockRequest(), res);

    expect(markAllNotificationsRead).toHaveBeenCalledWith("user-1");
    expect(res.status).toHaveBeenCalledWith(204);
  });
});

describe("markRead", () => {
  it("marks one notification read", async () => {
    vi.mocked(markNotificationRead).mockResolvedValue({ id: "n1" } as never);
    const res = mockResponse();

    await markRead(mockRequest({ params: { id: "n1" } }), res);

    expect(markNotificationRead).toHaveBeenCalledWith("user-1", "n1");
    expect(res.json).toHaveBeenCalledWith({ notification: { id: "n1" } });
  });
});
