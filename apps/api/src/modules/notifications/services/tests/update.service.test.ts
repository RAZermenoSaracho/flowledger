import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { markAllNotificationsRead, markNotificationRead } from "../update.service.js";

describe("markAllNotificationsRead", () => {
  it("sets readAt on every unread notification for the user", async () => {
    prismaMock.notification.updateMany.mockResolvedValue({ count: 3 } as never);

    await markAllNotificationsRead("user-1");

    expect(prismaMock.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1", readAt: null },
      data: { readAt: expect.any(Date) }
    });
  });
});

describe("markNotificationRead", () => {
  it("throws a 404 when the notification doesn't belong to the user", async () => {
    prismaMock.notification.findFirst.mockResolvedValue(null);

    await expect(
      markNotificationRead("user-1", "notif-1")
    ).rejects.toThrow("Notification not found");
  });

  it("sets readAt when previously unread", async () => {
    prismaMock.notification.findFirst.mockResolvedValue({
      id: "notif-1",
      readAt: null
    } as never);
    prismaMock.notification.update.mockResolvedValue({} as never);

    await markNotificationRead("user-1", "notif-1");

    expect(prismaMock.notification.update).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { readAt: expect.any(Date) }
    });
  });

  it("leaves an already-read notification's readAt untouched", async () => {
    const alreadyReadAt = new Date("2024-01-01");
    prismaMock.notification.findFirst.mockResolvedValue({
      id: "notif-1",
      readAt: alreadyReadAt
    } as never);
    prismaMock.notification.update.mockResolvedValue({} as never);

    await markNotificationRead("user-1", "notif-1");

    expect(prismaMock.notification.update).toHaveBeenCalledWith({
      where: { id: "notif-1" },
      data: { readAt: alreadyReadAt }
    });
  });
});
