import { describe, expect, it, vi } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";

vi.mock("../read.service.js", () => ({
  getGroupAdmin: vi.fn()
}));

const { getGroupAdmin } = await import("../read.service.js");
const getGroupAdminMock = vi.mocked(getGroupAdmin);

const { archiveGroup, restoreGroup, updateGroup } = await import(
  "../update.service.js"
);

describe("updateGroup", () => {
  it("requires admin, then updates only the given fields", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.update.mockResolvedValue({} as never);

    await updateGroup("user-1", "group-1", { name: "Renamed" });

    expect(prismaMock.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "group-1" },
        data: { name: "Renamed" }
      })
    );
  });

  it("clears description when explicitly set to null", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.update.mockResolvedValue({} as never);

    await updateGroup("user-1", "group-1", { description: null });

    expect(prismaMock.group.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { description: null } })
    );
  });

  it("omits fields that weren't provided", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.update.mockResolvedValue({} as never);

    await updateGroup("user-1", "group-1", {});

    expect(prismaMock.group.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} })
    );
  });
});

describe("archiveGroup", () => {
  it("marks the group archived with a timestamp", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.update.mockResolvedValue({} as never);

    await archiveGroup("user-1", "group-1");

    expect(prismaMock.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isArchived: true, archivedAt: expect.any(Date) }
      })
    );
  });
});

describe("restoreGroup", () => {
  it("clears the archived flag and timestamp", async () => {
    getGroupAdminMock.mockResolvedValue({} as never);
    prismaMock.group.update.mockResolvedValue({} as never);

    await restoreGroup("user-1", "group-1");

    expect(prismaMock.group.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isArchived: false, archivedAt: null }
      })
    );
  });
});
