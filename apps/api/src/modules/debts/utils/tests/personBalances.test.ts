import { describe, expect, it } from "vitest";
import { buildPersonBalances } from "../personBalances.js";

const owner = { id: "owner-1", name: "Owner", email: "owner@example.com" };
const friend = { id: "friend-1", name: "Friend", email: "friend@example.com" };

function debt(overrides: Partial<Parameters<typeof buildPersonBalances>[1][number]>) {
  return {
    id: "debt-1",
    userId: friend.id,
    participantName: friend.name,
    debtorUserId: friend.id,
    creditorUserId: owner.id,
    outstandingAmount: 100,
    outstandingAmountInPreferredCurrency: 100,
    user: friend,
    sharedExpense: { ownerUserId: owner.id, owner },
    ...overrides
  };
}

describe("buildPersonBalances", () => {
  it("groups a single counterparty's owed-to-me and i-owe debts, netting the totals", () => {
    const [balance] = buildPersonBalances(
      owner.id,
      [debt({ outstandingAmount: 100, outstandingAmountInPreferredCurrency: 100 })],
      [debt({ outstandingAmount: 30, outstandingAmountInPreferredCurrency: 30 })]
    );

    expect(balance).toMatchObject({
      key: friend.id,
      theyOweMeTotal: 100,
      iOweThemTotal: 30,
      netBalance: 70
    });
    expect(balance?.theyOweMe).toHaveLength(1);
    expect(balance?.iOweThem).toHaveLength(1);
  });

  it("prefers outstandingAmountInPreferredCurrency over outstandingAmount when both are present", () => {
    const [balance] = buildPersonBalances(
      owner.id,
      [
        debt({
          outstandingAmount: 100,
          outstandingAmountInPreferredCurrency: 85
        })
      ],
      []
    );

    expect(balance?.theyOweMeTotal).toBe(85);
  });

  it("keeps separate counterparties as separate balance entries", () => {
    const anotherFriend = {
      id: "friend-2",
      name: "Another",
      email: "another@example.com"
    };

    const balances = buildPersonBalances(
      owner.id,
      [
        debt({}),
        debt({
          id: "debt-2",
          userId: anotherFriend.id,
          participantName: anotherFriend.name,
          debtorUserId: anotherFriend.id,
          user: anotherFriend
        })
      ],
      []
    );

    expect(balances.map((balance) => balance.key).sort()).toEqual(
      [friend.id, anotherFriend.id].sort()
    );
  });

  it("sorts by absolute net balance descending", () => {
    const bigDebtor = { id: "big-1", name: "Big", email: "big@example.com" };
    const smallDebtor = {
      id: "small-1",
      name: "Small",
      email: "small@example.com"
    };

    const balances = buildPersonBalances(
      owner.id,
      [
        debt({
          userId: smallDebtor.id,
          debtorUserId: smallDebtor.id,
          user: smallDebtor,
          outstandingAmount: 10,
          outstandingAmountInPreferredCurrency: 10
        }),
        debt({
          id: "debt-2",
          userId: bigDebtor.id,
          debtorUserId: bigDebtor.id,
          user: bigDebtor,
          outstandingAmount: 500,
          outstandingAmountInPreferredCurrency: 500
        })
      ],
      []
    );

    expect(balances.map((balance) => balance.key)).toEqual([
      bigDebtor.id,
      smallDebtor.id
    ]);
  });

  it("falls back to participantName for a manual (unlinked) participant", () => {
    const [balance] = buildPersonBalances(
      owner.id,
      [
        debt({
          userId: null,
          participantName: "Cash Friend",
          debtorUserId: null,
          user: null
        })
      ],
      []
    );

    expect(balance?.fallbackName).toBe("Cash Friend");
    expect(balance?.person).toBeNull();
  });
});
