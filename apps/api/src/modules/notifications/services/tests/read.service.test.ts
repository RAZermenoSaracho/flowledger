import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { countUnreadNotifications, listNotifications } from "../read.service.js";

describe("listNotifications", () => {
  it("fetches the user's 50 most recent notifications, newest first", async () => {
    prismaMock.notification.findMany.mockResolvedValue([]);

    await listNotifications("user-1");

    expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      orderBy: { createdAt: "desc" },
      take: 50
    });
  });
});

describe("countUnreadNotifications", () => {
  it("counts unread notifications for the user", async () => {
    prismaMock.notification.count.mockResolvedValue(3);

    expect(await countUnreadNotifications("user-1")).toBe(3);
    expect(prismaMock.notification.count).toHaveBeenCalledWith({
      where: { userId: "user-1", readAt: null }
    });
  });
});
