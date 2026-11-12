import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import { redactGroupForNonMembers } from "../groupVisibility.js";

const shared = (ownerUserId: string, groupId: string | null) => ({ ownerUserId, transaction: { groupId, amount: 1 } });

describe("redactGroupForNonMembers", () => {
  it("nulls groupId for a non-owner outside the Group, including nested rows", async () => {
    prismaMock.groupMember.findMany.mockResolvedValue([]);
    const value = { rows: [{ sharedExpense: shared("owner", "g1") }] };

    await redactGroupForNonMembers("viewer", value);

    expect(value.rows[0]?.sharedExpense.transaction.groupId).toBeNull();
    expect(prismaMock.groupMember.findMany).toHaveBeenCalledWith({
      where: { userId: "viewer", groupId: { in: ["g1"] } },
      select: { groupId: true }
    });
  });

  it("keeps groupId for Group members and for the owner", async () => {
    prismaMock.groupMember.findMany.mockResolvedValue([{ groupId: "g1" }] as never);
    const value = [shared("owner", "g1"), shared("viewer", "g2")];

    await redactGroupForNonMembers("viewer", value);

    expect(value.map((v) => v.transaction.groupId)).toEqual(["g1", "g2"]);
  });

  it("does not query when there is no Group data", async () => {
    await redactGroupForNonMembers("viewer", [shared("owner", null)]);
    expect(prismaMock.groupMember.findMany).not.toHaveBeenCalled();
  });
});
