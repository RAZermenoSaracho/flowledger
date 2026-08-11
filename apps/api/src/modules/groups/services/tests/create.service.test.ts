import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../read.service.js", () => ({
  getGroupAdmin: vi.fn()
}));

vi.mock("../../../notifications/services/create.service.js", () => ({
  createNotifications: vi.fn()
}));

const { getGroupAdmin } = await import("../read.service.js");
const { createNotifications } = await import(
  "../../../notifications/services/create.service.js"
);
const getGroupAdminMock = vi.mocked(getGroupAdmin);
const createNotificationsMock = vi.mocked(createNotifications);

const {
  addGroupCategory,
  addGroupMember,
  createGroup,
  grantGroupCategoriesToUser
} = await import("../create.service.js");

describe("grantGroupCategoriesToUser", () => {
  it("grants access to every active category in the group", async () => {
    const tx = {
      category: { findMany: vi.fn().mockResolvedValue([{ id: "cat-1" }, { id: "cat-2" }]) },
      categoryUser: { createMany: vi.fn().mockResolvedValue({ count: 2 }) }
    };

    await grantGroupCategoriesToUser(tx as never, "group-1", "user-2");

    expect(tx.categoryUser.createMany).toHaveBeenCalledWith({
      data: [
        { categoryId: "cat-1", userId: "user-2" },
        { categoryId: "cat-2", userId: "user-2" }
      ],
      skipDuplicates: true
    });
  });

  it("does nothing when the group has no active categories", async () => {
    const tx = {
      category: { findMany: vi.fn().mockResolvedValue([]) },
      categoryUser: { createMany: vi.fn() }
    };

    await grantGroupCategoriesToUser(tx as never, "group-1", "user-2");

    expect(tx.categoryUser.createMany).not.toHaveBeenCalled();
  });
});

describe("createGroup", () => {
  it("creates the group with the owner seeded as an admin member", async () => {
    prismaMock.group.create.mockResolvedValue({ id: "group-1" } as never);

    await createGroup("user-1", { name: "Roommates" });

    expect(prismaMock.group.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          ownerUserId: "user-1",
          members: { create: { userId: "user-1", role: "admin" } }
        })
      })
    );
  });
});

describe("addGroupMember", () => {
  it("throws a 400 when adding yourself", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);

    await expect(addGroupMember("user-1", "group-1", "user-1")).rejects.toThrow(
      "You are already a group member"
    );
  });

  it("throws 404 when the group doesn't exist", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.findUnique.mockResolvedValue(null);

    await expect(addGroupMember("user-1", "group-1", "user-2")).rejects.toThrow(
      "Group not found"
    );
  });

  it("throws a 400 when the group is archived", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.findUnique.mockResolvedValue({ isArchived: true } as never);

    await expect(addGroupMember("user-1", "group-1", "user-2")).rejects.toThrow(
      "Archived groups cannot add members"
    );
  });

  it("throws a 400 when the target user doesn't exist", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.findUnique.mockResolvedValue({ isArchived: false } as never);
    prismaMock.user.findUnique.mockResolvedValue(null);

    await expect(addGroupMember("user-1", "group-1", "user-2")).rejects.toThrow(
      "User does not exist"
    );
  });

  it("throws a 409 when the user is already a member", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.findUnique.mockResolvedValue({ isArchived: false } as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-2" } as never);
    prismaMock.groupMember.findUnique.mockResolvedValue({ id: "m1" } as never);

    await expect(addGroupMember("user-1", "group-1", "user-2")).rejects.toThrow(
      "User is already a group member"
    );
  });

  it("creates the member, grants category access, and notifies them", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.findUnique.mockResolvedValue({ isArchived: false } as never);
    prismaMock.user.findUnique.mockResolvedValue({ id: "user-2" } as never);
    prismaMock.groupMember.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === "function") {
        const tx = {
          group: { findUnique: vi.fn().mockResolvedValue({ id: "group-1", name: "Roommates" }) },
          groupMember: {
            create: vi.fn().mockResolvedValue({ id: "member-1", userId: "user-2" })
          },
          category: { findMany: vi.fn().mockResolvedValue([]) },
          categoryUser: { createMany: vi.fn() },
          notification: { create: vi.fn() },
          notificationSubscription: { findMany: vi.fn().mockResolvedValue([]) }
        };
        return (arg as (tx: unknown) => unknown)(tx);
      }
      return Promise.resolve(arg);
    });

    const result = await addGroupMember("user-1", "group-1", "user-2");

    expect(result).toMatchObject({ id: "member-1" });
    expect(createNotificationsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({ userId: "user-2", type: "group_member_added" })
      ])
    );
  });
});

describe("addGroupCategory", () => {
  it("requires the caller to be a group admin", async () => {
    getGroupAdminMock.mockRejectedValue(new Error("Group not found"));

    await expect(
      addGroupCategory("user-1", "group-1", { name: "Rent", type: "expense" })
    ).rejects.toThrow("Group not found");
  });

  it("throws a 400 when the group is archived", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.findUnique.mockResolvedValue({ isArchived: true } as never);

    await expect(
      addGroupCategory("user-1", "group-1", { name: "Rent", type: "expense" })
    ).rejects.toThrow("Archived groups cannot add categories");
  });

  it("creates the category shared with every current group member", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.findUnique.mockResolvedValue({ isArchived: false } as never);

    const categoryCreate = vi.fn().mockResolvedValue({ id: "cat-1" });
    prismaMock.$transaction.mockImplementation((arg: unknown) => {
      if (typeof arg === "function") {
        const tx = {
          groupMember: {
            findMany: vi.fn().mockResolvedValue([{ userId: "user-1" }, { userId: "user-2" }])
          },
          category: { create: categoryCreate }
        };
        return (arg as (tx: unknown) => unknown)(tx);
      }
      return Promise.resolve(arg);
    });

    await addGroupCategory("user-1", "group-1", { name: "Rent", type: "expense" });

    expect(categoryCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        groupId: "group-1",
        name: "Rent",
        type: "expense",
        users: { create: [{ userId: "user-1" }, { userId: "user-2" }] }
      })
    });
  });
});
