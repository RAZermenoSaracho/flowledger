import { describe, expect, it } from "vitest";
import type { Debt, PersonBalance } from "../../../../types/debts.types";
import {
  availableSettlementAmount,
  debtDescription,
  debtTitle,
  displayPerson,
  otherParty,
  participantName,
  partyName,
  statusLabel,
  transactionTypeLabel
} from "../debtDisplay";

function makeDebt(overrides: Partial<Debt> = {}): Debt {
  return {
    id: "debt-1",
    userId: "user-2",
    participantName: "Friend",
    currency: "USD",
    shareAmount: 100,
    paidAmount: 40,
    status: "partial",
    sharedExpenseId: "se-1",
    debtorUserId: "user-2",
    creditorUserId: "user-1",
    outstandingAmount: 60,
    pendingSettlementAmount: 0,
    sharedExpense: {
      id: "se-1",
      transactionId: "tx-1",
      ownerUserId: "user-1",
      title: "Dinner split",
      totalAmount: 100,
      status: "open",
      owner: { id: "user-1", name: "Jane", email: "jane@example.com" },
      transaction: { type: "expense" } as Debt["sharedExpense"]["transaction"],
      participants: [],
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z"
    },
    user: { id: "user-2", name: "Sam", email: "sam@example.com" },
    settlementRequests: [],
    ...overrides
  };
}

describe("debtTitle", () => {
  it("returns the shared expense's title", () => {
    expect(debtTitle(makeDebt())).toBe("Dinner split");
  });
});

describe("participantName", () => {
  it("prefers the linked user's name over the stored participant name", () => {
    expect(participantName(makeDebt())).toBe("Sam");
  });

  it("falls back to the stored participant name when there's no linked user", () => {
    expect(participantName(makeDebt({ user: null }))).toBe("Friend");
  });
});

describe("partyName", () => {
  it("returns undefined when userId is not given", () => {
    expect(partyName(makeDebt(), undefined)).toBeUndefined();
  });

  it("resolves the shared expense owner's name", () => {
    expect(partyName(makeDebt(), "user-1")).toBe("Jane");
  });

  it("resolves the linked participant's name", () => {
    expect(partyName(makeDebt(), "user-2")).toBe("Sam");
  });

  it("falls back to participantName for an unlinked manual participant matching debtor/creditor id", () => {
    const debt = makeDebt({ userId: undefined, user: null, debtorUserId: "manual-1" });
    expect(partyName(debt, "manual-1")).toBe("Friend");
  });

  it("returns undefined for an unrecognized userId", () => {
    expect(partyName(makeDebt(), "someone-else")).toBeUndefined();
  });
});

describe("otherParty", () => {
  it("resolves the creditor as the other party when the viewer is the debtor", () => {
    const result = otherParty(makeDebt(), "user-2");
    expect(result.key).toBe("user-1");
    expect(result.person?.name).toBe("Jane");
    expect(result.fallbackName).toBe("Jane");
  });

  it("resolves the debtor as the other party when the viewer is the creditor", () => {
    const result = otherParty(makeDebt(), "user-1");
    expect(result.key).toBe("user-2");
    expect(result.person?.name).toBe("Sam");
  });

  it("falls back to a synthetic key when neither debtor/creditor id resolves", () => {
    const debt = makeDebt({
      userId: undefined,
      user: null,
      debtorUserId: null,
      creditorUserId: null,
      participantName: ""
    });
    const result = otherParty(debt, "user-1");
    expect(result.key).toBe("participant:debt-1");
    // fallbackName falls through partyName(...) ?? participantName(debt) ??
    // "Unknown user" — since participantName is "" (falsy but not nullish),
    // the `??` chain stops there rather than reaching "Unknown user".
    expect(result.fallbackName).toBe("");
  });
});

describe("displayPerson", () => {
  it("prefers the linked person's name", () => {
    const balance: PersonBalance = {
      key: "user-2",
      person: { id: "user-2", name: "Sam", email: "sam@example.com" },
      fallbackName: "Fallback",
      theyOweMe: [],
      iOweThem: [],
      theyOweMeTotal: 0,
      iOweThemTotal: 0,
      netBalance: 0
    };
    expect(displayPerson(balance)).toBe("Sam");
  });

  it("falls back to fallbackName when there's no linked person", () => {
    const balance: PersonBalance = {
      key: "manual",
      person: null,
      fallbackName: "Fallback",
      theyOweMe: [],
      iOweThem: [],
      theyOweMeTotal: 0,
      iOweThemTotal: 0,
      netBalance: 0
    };
    expect(displayPerson(balance)).toBe("Fallback");
  });
});

describe("transactionTypeLabel", () => {
  it("labels an income transaction split", () => {
    const debt = makeDebt({
      sharedExpense: {
        ...makeDebt().sharedExpense,
        transaction: { type: "income" } as Debt["sharedExpense"]["transaction"]
      }
    });
    expect(transactionTypeLabel(debt)).toBe("income split");
  });

  it("labels an expense transaction split", () => {
    expect(transactionTypeLabel(makeDebt())).toBe("expense split");
  });
});

describe("debtDescription", () => {
  it("describes the debt from the debtor's perspective", () => {
    expect(debtDescription(makeDebt(), "user-2")).toBe(
      "Jane · expense split · $40.00 settled of $100.00"
    );
  });

  it("describes the debt from the creditor's perspective", () => {
    expect(debtDescription(makeDebt(), "user-1")).toBe(
      "Sam · expense split · $40.00 settled of $100.00"
    );
  });
});

describe("statusLabel", () => {
  it("labels a fully-settled debt as 'settled'", () => {
    expect(statusLabel(makeDebt({ outstandingAmount: 0 }))).toBe("settled");
  });

  it("labels a debt with a pending settlement as 'settlement pending'", () => {
    expect(
      statusLabel(makeDebt({ outstandingAmount: 60, pendingSettlementAmount: 20 }))
    ).toBe("settlement pending");
  });

  it("falls back to the raw status otherwise", () => {
    expect(
      statusLabel(makeDebt({ outstandingAmount: 60, pendingSettlementAmount: 0, status: "partial" }))
    ).toBe("partial");
  });
});

describe("availableSettlementAmount", () => {
  it("subtracts already-pending settlement amount from outstanding", () => {
    expect(
      availableSettlementAmount(
        makeDebt({ outstandingAmount: 60, pendingSettlementAmount: 20 })
      )
    ).toBe(40);
  });

  it("never goes below zero", () => {
    expect(
      availableSettlementAmount(
        makeDebt({ outstandingAmount: 10, pendingSettlementAmount: 20 })
      )
    ).toBe(0);
  });
});
