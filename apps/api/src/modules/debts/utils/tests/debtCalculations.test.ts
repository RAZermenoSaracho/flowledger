import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  balanceDebt,
  debtOutstanding,
  participantStatus,
  pendingSettlementTotal,
  settlementNotes
} from "../debtCalculations.js";

describe("debtOutstanding", () => {
  it("returns shareAmount minus paidAmount", () => {
    expect(
      debtOutstanding({
        shareAmount: new Prisma.Decimal("100"),
        paidAmount: new Prisma.Decimal("40")
      })
    ).toEqual(new Prisma.Decimal("60"));
  });

  it("floors at 0 when paidAmount exceeds shareAmount", () => {
    expect(
      debtOutstanding({
        shareAmount: new Prisma.Decimal("50"),
        paidAmount: new Prisma.Decimal("75")
      })
    ).toEqual(new Prisma.Decimal("0"));
  });
});

describe("pendingSettlementTotal", () => {
  const baseDebt = {
    userId: "participant-1",
    sharedExpense: {
      ownerUserId: "owner-1",
      transaction: { type: "expense" as const }
    }
  };

  it("sums only pending requests matching the current debt direction", () => {
    const total = pendingSettlementTotal({
      ...baseDebt,
      settlementRequests: [
        {
          status: "pending",
          amount: new Prisma.Decimal("30"),
          debtorUserId: "participant-1",
          creditorUserId: "owner-1"
        },
        {
          status: "approved",
          amount: new Prisma.Decimal("100"),
          debtorUserId: "participant-1",
          creditorUserId: "owner-1"
        },
        {
          status: "pending",
          amount: new Prisma.Decimal("15"),
          debtorUserId: "owner-1",
          creditorUserId: "participant-1"
        }
      ]
    });

    expect(total).toEqual(new Prisma.Decimal("30"));
  });

  it("returns 0 for a debt with no direction (transfer)", () => {
    const total = pendingSettlementTotal({
      userId: "participant-1",
      sharedExpense: {
        ownerUserId: "owner-1",
        transaction: { type: "transfer" as const }
      },
      settlementRequests: [
        {
          status: "pending",
          amount: new Prisma.Decimal("30"),
          debtorUserId: "participant-1",
          creditorUserId: "owner-1"
        }
      ]
    });

    expect(total).toEqual(new Prisma.Decimal("0"));
  });

  it("returns 0 when there are no settlement requests", () => {
    expect(pendingSettlementTotal({ ...baseDebt, settlementRequests: [] })).toEqual(
      new Prisma.Decimal(0)
    );
  });
});

describe("balanceDebt", () => {
  it("enriches a debt with direction and outstanding/pending amounts", () => {
    const debt = {
      id: "debt-1",
      userId: "participant-1",
      shareAmount: new Prisma.Decimal("100"),
      paidAmount: new Prisma.Decimal("20"),
      sharedExpense: {
        ownerUserId: "owner-1",
        transaction: { type: "expense" as const }
      },
      settlementRequests: []
    };

    const result = balanceDebt(debt as never);

    expect(result).toMatchObject({
      id: "debt-1",
      debtorUserId: "participant-1",
      creditorUserId: "owner-1",
      outstandingAmount: new Prisma.Decimal("80"),
      pendingSettlementAmount: new Prisma.Decimal("0")
    });
  });
});

describe("participantStatus", () => {
  it("is 'paid' when paidAmount meets or exceeds shareAmount", () => {
    expect(participantStatus(100, 100)).toBe("paid");
    expect(participantStatus(100, 150)).toBe("paid");
  });

  it("is 'partial' when paidAmount is between 0 and shareAmount", () => {
    expect(participantStatus(100, 50)).toBe("partial");
  });

  it("is 'pending' when paidAmount is 0", () => {
    expect(participantStatus(100, 0)).toBe("pending");
  });
});

describe("settlementNotes", () => {
  it("joins a note and payment info with a newline", () => {
    expect(
      settlementNotes({ note: "Thanks!", paymentInfo: "Venmo @sam" })
    ).toBe("Thanks!\nPayment info: Venmo @sam");
  });

  it("returns just the note when paymentInfo is null", () => {
    expect(settlementNotes({ note: "Thanks!", paymentInfo: null })).toBe(
      "Thanks!"
    );
  });

  it("returns just the payment info when note is null", () => {
    expect(settlementNotes({ note: null, paymentInfo: "Venmo @sam" })).toBe(
      "Payment info: Venmo @sam"
    );
  });

  it("returns an empty string when both are null", () => {
    expect(settlementNotes({ note: null, paymentInfo: null })).toBe("");
  });
});

describe("crypto exactness", () => {
  it("settles a 1 ETH share in two partial payments (0.4 + 0.6) reaching paid == share", () => {
    const share = new Prisma.Decimal("1");
    const afterFirst = new Prisma.Decimal("0.4");
    expect(participantStatus(share, afterFirst)).toBe("partial");
    expect(debtOutstanding({ shareAmount: share, paidAmount: afterFirst }).toFixed()).toBe("0.6");
    const afterSecond = afterFirst.plus("0.6");
    expect(participantStatus(share, afterSecond)).toBe("paid");
    expect(debtOutstanding({ shareAmount: share, paidAmount: afterSecond }).isZero()).toBe(true);
  });

  it("keeps 0.01 BTC increments exact", () => {
    const paid = Array.from({ length: 3 }, () => "0.01").reduce((sum, n) => sum.plus(n), new Prisma.Decimal(0));
    expect(paid.toFixed()).toBe("0.03");
    expect(participantStatus("0.03", paid)).toBe("paid");
  });
});
