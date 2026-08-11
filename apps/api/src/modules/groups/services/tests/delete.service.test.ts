import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../read.service.js", () => ({
  getGroupAdmin: vi.fn(),
  getGroupMembership: vi.fn()
}));

const { getGroupAdmin, getGroupMembership } = await import("../read.service.js");
const getGroupAdminMock = vi.mocked(getGroupAdmin);
const getGroupMembershipMock = vi.mocked(getGroupMembership);

const { deleteGroup, removeGroupMember, revokeGroupCategoriesFromUser } =
  await import("../delete.service.js");

describe("revokeGroupCategoriesFromUser", () => {
  it("deletes the user's CategoryUser rows scoped to the group's categories", async () => {
    const tx = { categoryUser: { deleteMany: vi.fn() } };

    await revokeGroupCategoriesFromUser(tx as never, "group-1", "user-2");

    expect(tx.categoryUser.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-2", category: { groupId: "group-1" } }
    });
  });
});

describe("deleteGroup", () => {
  it("requires admin, then deletes the group", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.delete.mockResolvedValue({} as never);

    await deleteGroup("user-1", "group-1");

    expect(prismaMock.group.delete).toHaveBeenCalledWith({
      where: { id: "group-1" }
    });
  });
});

describe("removeGroupMember", () => {
  it("allows a member to remove themself without requiring admin", async () => {
    getGroupMembershipMock.mockResolvedValue({} as never);
    prismaMock.groupMember.findUnique.mockResolvedValue({ id: "m1" } as never);
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({
            categoryUser: { deleteMany: vi.fn() },
            groupMember: { delete: vi.fn() }
          })
        : Promise.resolve(arg)
    );

    await removeGroupMember("user-1", "group-1", "user-1");

    expect(getGroupAdminMock).not.toHaveBeenCalled();
    expect(getGroupMembershipMock).toHaveBeenCalledWith("user-1", "group-1");
  });

  it("requires admin to remove someone else", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.groupMember.findUnique.mockResolvedValue({ id: "m1" } as never);
    (prismaMock.$transaction.mockImplementation as unknown as (fn: (arg: unknown) => unknown) => unknown)((arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)({
            categoryUser: { deleteMany: vi.fn() },
            groupMember: { delete: vi.fn() }
          })
        : Promise.resolve(arg)
    );

    await removeGroupMember("user-1", "group-1", "user-2");

    expect(getGroupAdminMock).toHaveBeenCalledWith("user-1", "group-1");
    expect(getGroupMembershipMock).not.toHaveBeenCalled();
  });

  it("throws a 404 when the target isn't a member", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.groupMember.findUnique.mockResolvedValue(null);

    await expect(
      removeGroupMember("user-1", "group-1", "user-2")
    ).rejects.toThrow("Group member not found");
  });
});
