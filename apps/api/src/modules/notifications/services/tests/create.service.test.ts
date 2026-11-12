import { describe, expect, it, vi } from "vitest";
import { createDedupedNotifications, createNotifications } from "../create.service.js";

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

describe("createDedupedNotifications", () => {
  const note = (overrides: Record<string, unknown> = {}) => ({
    userId: "u1",
    type: "shared_expense_updated" as const,
    title: "t",
    message: "m",
    metadata: { sharedExpenseId: "se-1" },
    ...overrides
  });
  const client = () => ({
    notification: { createMany: vi.fn(), deleteMany: vi.fn() },
    userBlock: { findMany: vi.fn().mockResolvedValue([]) }
  });

  it("deletes the unread notification of the same recipient, shared expense and type before inserting", async () => {
    const tx = client();

    await createDedupedNotifications(tx as never, [note()]);

    expect(tx.notification.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", type: "shared_expense_updated", readAt: null, metadata: { path: ["sharedExpenseId"], equals: "se-1" } }
    });
    expect(tx.notification.createMany.mock.calls[0]![0].data).toHaveLength(1);
  });

  it("keeps only the latest of duplicates within one batch", async () => {
    const tx = client();

    await createDedupedNotifications(tx as never, [note({ message: "first" }), note({ message: "latest" })]);

    const data = tx.notification.createMany.mock.calls[0]![0].data;
    expect(data).toHaveLength(1);
    expect(data[0].message).toBe("latest");
  });

  it("keeps different recipients, types and shared expenses apart and passes plain notifications through", async () => {
    const tx = client();

    await createDedupedNotifications(tx as never, [
      note(),
      note({ userId: "u2" }),
      note({ type: "shared_expense_invited" }),
      note({ metadata: { sharedExpenseId: "se-2" } }),
      note({ metadata: undefined })
    ]);

    expect(tx.notification.createMany.mock.calls[0]![0].data).toHaveLength(5);
    expect(tx.notification.deleteMany).toHaveBeenCalledTimes(4);
  });

  it("still suppresses notifications from a sender the recipient blocked", async () => {
    const tx = client();
    tx.userBlock.findMany.mockResolvedValue([{ blockerId: "u1", blockedId: "owner" }]);

    await createDedupedNotifications(tx as never, [note({ senderUserId: "owner" })]);

    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
});
