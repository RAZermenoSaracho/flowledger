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
