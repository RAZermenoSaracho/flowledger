import { beforeEach, describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../../../groups/services/read.service.js", () => ({
  getGroupAdmin: vi.fn(),
  getGroupMembership: vi.fn()
}));

const { getGroupAdmin, getGroupMembership } = await import(
  "../../../groups/services/read.service.js"
);
const getGroupAdminMock = vi.mocked(getGroupAdmin);
const getGroupMembershipMock = vi.mocked(getGroupMembership);

const { getEditableCategory, listCategories } = await import("../read.service.js");

beforeEach(() => {
  getGroupAdminMock.mockReset();
  getGroupMembershipMock.mockReset();
});

describe("getEditableCategory", () => {
  it("returns a personal category the user owns", async () => {
    prismaMock.category.findFirst.mockResolvedValue({
      id: "cat-1",
      groupId: null
    } as never);

    const category = await getEditableCategory("user-1", "cat-1");

    expect(category).toMatchObject({ id: "cat-1" });
    expect(getGroupAdminMock).not.toHaveBeenCalled();
  });

  it("throws a 404 when no matching category is found", async () => {
    prismaMock.category.findFirst.mockResolvedValue(null);

    await expect(getEditableCategory("user-1", "missing")).rejects.toThrow(
      "Category not found"
    );
  });

  it("requires group-admin for a group category", async () => {
    prismaMock.category.findFirst.mockResolvedValue({
      id: "cat-1",
      groupId: "group-1"
    } as never);
    getGroupAdminMock.mockResolvedValue({} as never);

    await getEditableCategory("user-1", "cat-1");

    expect(getGroupAdminMock).toHaveBeenCalledWith("user-1", "group-1");
  });

  it("propagates a group-admin authorization failure", async () => {
    prismaMock.category.findFirst.mockResolvedValue({
      id: "cat-1",
      groupId: "group-1"
    } as never);
    getGroupAdminMock.mockRejectedValue(new Error("Forbidden"));

    await expect(getEditableCategory("user-1", "cat-1")).rejects.toThrow(
      "Forbidden"
    );
  });
});

describe("listCategories", () => {
  it("scopes to the user's personal categories by default", async () => {
    prismaMock.category.findMany.mockResolvedValue([
      { id: "cat-1", name: "Groceries", type: "expense" }
    ] as never);

    const results = await listCategories("user-1", {}, undefined);

    expect(prismaMock.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { groupId: null, users: { some: { userId: "user-1" } } }
      })
    );
    expect(results).toEqual([
      { id: "cat-1", name: "Groceries", type: "expense" }
    ]);
  });

  it("requires group membership when scoped to a groupId", async () => {
    getGroupMembershipMock.mockResolvedValue({} as never);
    prismaMock.category.findMany.mockResolvedValue([]);

    await listCategories("user-1", { groupId: "group-1" }, undefined);

    expect(getGroupMembershipMock).toHaveBeenCalledWith("user-1", "group-1");
  });

  it("scopes to personal + accessible group categories when scope is 'all'", async () => {
    prismaMock.category.findMany.mockResolvedValue([]);

    await listCategories("user-1", { scope: "all" }, undefined);

    expect(prismaMock.category.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          users: { some: { userId: "user-1" } }
        })
      })
    );
  });

  it("rejects a query param that isn't valid JSON", async () => {
    await expect(
      listCategories("user-1", {}, "{not json")
    ).rejects.toThrow("Invalid categories query: not valid JSON");
  });

  it("rejects a query param that isn't a JSON object", async () => {
    await expect(listCategories("user-1", {}, "[1,2,3]")).rejects.toThrow(
      "Invalid categories query: must be a JSON object"
    );
  });
});
