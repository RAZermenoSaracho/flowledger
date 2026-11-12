import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { unblockUser } from "../delete.service.js";

describe("unblockUser", () => {
  it("deletes only the caller's block, touching no shares", async () => {
    prismaMock.userBlock.deleteMany.mockResolvedValue({ count: 0 });

    await unblockUser("u1", "u2");

    expect(prismaMock.userBlock.deleteMany).toHaveBeenCalledWith({ where: { blockerId: "u1", blockedId: "u2" } });
    expect(prismaMock.sharedExpenseParticipant.updateMany).not.toHaveBeenCalled();
  });
});
