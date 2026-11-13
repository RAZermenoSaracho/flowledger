import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { buildPersonBalances } from "../personBalances.js";

const owner = { id: "owner-1", username: "owner", displayName: null };
const friend = { id: "friend-1", username: "friend", displayName: null };

function debt(overrides: Partial<Parameters<typeof buildPersonBalances>[1][number]>) {
  return {
    id: "debt-1",
    userId: friend.id,
    participantName: "@friend",
    debtorUserId: friend.id,
    creditorUserId: owner.id,
    outstandingAmount: new Prisma.Decimal("100"),
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
      [debt({ outstandingAmount: new Prisma.Decimal("100"), outstandingAmountInPreferredCurrency: 100 })],
      [debt({ outstandingAmount: new Prisma.Decimal("30"), outstandingAmountInPreferredCurrency: 30 })]
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
          outstandingAmount: new Prisma.Decimal("100"),
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
      username: "another", displayName: null
    };

    const balances = buildPersonBalances(
      owner.id,
      [
        debt({}),
        debt({
          id: "debt-2",
          userId: anotherFriend.id,
          participantName: "@another",
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
    const bigDebtor = { id: "big-1", username: "big", displayName: null };
    const smallDebtor = {
      id: "small-1",
      username: "small", displayName: null
    };

    const balances = buildPersonBalances(
      owner.id,
      [
        debt({
          userId: smallDebtor.id,
          debtorUserId: smallDebtor.id,
          user: smallDebtor,
          outstandingAmount: new Prisma.Decimal("10"),
          outstandingAmountInPreferredCurrency: 10
        }),
        debt({
          id: "debt-2",
          userId: bigDebtor.id,
          debtorUserId: bigDebtor.id,
          user: bigDebtor,
          outstandingAmount: new Prisma.Decimal("500"),
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

  it("labels the counterparty by username, adding the display name only when public", () => {
    const named = { id: "n-1", username: "nina", displayName: "Nina" };
    const [balance] = buildPersonBalances(
      owner.id,
      [debt({ userId: named.id, debtorUserId: named.id, participantName: "stale", user: named })],
      []
    );
    expect(balance?.person).toEqual(named);
    expect(balance?.fallbackName).toBe("Nina (@nina)");
  });

  it("totals mixed-currency debts by their preferred-currency valuation, never by native amounts", () => {
    const [balance] = buildPersonBalances(
      owner.id,
      [
        debt({ id: "btc", outstandingAmount: new Prisma.Decimal("0.01"), outstandingAmountInPreferredCurrency: 650.1 }),
        debt({ id: "mxn", outstandingAmount: new Prisma.Decimal("1000"), outstandingAmountInPreferredCurrency: 55.2 }),
        debt({ id: "eth", outstandingAmount: new Prisma.Decimal("1"), outstandingAmountInPreferredCurrency: 0.1 })
      ],
      [debt({ id: "usd", outstandingAmount: new Prisma.Decimal("5"), outstandingAmountInPreferredCurrency: 0.2 })]
    );

    expect(balance?.theyOweMeTotal).toBe(705.4);
    expect(balance?.iOweThemTotal).toBe(0.2);
    expect(balance?.netBalance).toBe(705.2);
  });
});
