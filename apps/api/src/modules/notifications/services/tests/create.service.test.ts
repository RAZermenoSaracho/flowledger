import { describe, expect, it, vi } from "vitest";
import { createNotifications } from "../create.service.js";

function mockClient() {
  return { notification: { createMany: vi.fn() } };
}

describe("createNotifications", () => {
  it("bulk-inserts notifications with a userId", async () => {
    const tx = mockClient();

    await createNotifications(tx as never, [
      {
        userId: "user-1",
        type: "group_member_added",
        title: "Added",
        message: "You were added.",
        metadata: { groupId: "g1" }
      }
    ]);

    expect(tx.notification.createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "user-1",
          type: "group_member_added",
          title: "Added",
          message: "You were added.",
          metadata: { groupId: "g1" }
        }
      ]
    });
  });

  it("silently drops notifications with no userId", async () => {
    const tx = mockClient();

    await createNotifications(tx as never, [
      {
        userId: null,
        type: "shared_expense_added",
        title: "Added",
        message: "x",
        metadata: {}
      } as never
    ]);

    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });

  it("is a no-op when every notification lacks a userId", async () => {
    const tx = mockClient();

    await createNotifications(tx as never, []);

    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
});

describe("createNotifications blocked senders", () => {
  it("drops notifications whose recipient has blocked the sender and keeps the rest", async () => {
    const tx = {
      notification: { createMany: vi.fn() },
      userBlock: { findMany: vi.fn().mockResolvedValue([{ blockerId: "user-1", blockedId: "owner" }]) }
    };

    await createNotifications(tx as never, [
      { userId: "user-1", type: "shared_expense_invited", title: "t", message: "m", senderUserId: "owner" },
      { userId: "user-2", type: "shared_expense_invited", title: "t", message: "m", senderUserId: "owner" },
      { userId: "user-1", type: "group_member_added", title: "t", message: "m" }
    ]);

    const data = tx.notification.createMany.mock.calls[0]![0].data;
    expect(data.map((n: { userId: string }) => n.userId)).toEqual(["user-2", "user-1"]);
    expect(data[0]).not.toHaveProperty("senderUserId");
  });

  it("does not query blocks when no notification has a sender", async () => {
    const tx = { notification: { createMany: vi.fn() }, userBlock: { findMany: vi.fn() } };
    await createNotifications(tx as never, [{ userId: "u", type: "group_member_added", title: "t", message: "m" }]);
    expect(tx.userBlock.findMany).not.toHaveBeenCalled();
  });
});
