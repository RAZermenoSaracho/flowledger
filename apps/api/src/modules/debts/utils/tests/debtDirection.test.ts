import { describe, expect, it } from "vitest";
import {
  getDebtDirection,
  isDebtRelevantToUser,
  isSettlementDirectionCurrent
} from "../debtDirection.js";

const expenseDebt = {
  userId: "participant-1",
  sharedExpense: {
    ownerUserId: "owner-1",
    transaction: { type: "expense" as const }
  }
};

const incomeDebt = {
  userId: "participant-1",
  sharedExpense: {
    ownerUserId: "owner-1",
    transaction: { type: "income" as const }
  }
};

const transferDebt = {
  userId: "participant-1",
  sharedExpense: {
    ownerUserId: "owner-1",
    transaction: { type: "transfer" as const }
  }
};

const manualExpenseDebt = {
  userId: null,
  sharedExpense: {
    ownerUserId: "owner-1",
    transaction: { type: "expense" as const }
  }
};

const manualIncomeDebt = {
  userId: null,
  sharedExpense: {
    ownerUserId: "owner-1",
    transaction: { type: "income" as const }
  }
};

describe("getDebtDirection", () => {
  it("puts the participant as debtor and owner as creditor for an expense", () => {
    expect(getDebtDirection(expenseDebt)).toEqual({
      debtorUserId: "participant-1",
      creditorUserId: "owner-1"
    });
  });

  it("puts the owner as debtor and participant as creditor for income", () => {
    expect(getDebtDirection(incomeDebt)).toEqual({
      debtorUserId: "owner-1",
      creditorUserId: "participant-1"
    });
  });

  it("returns null for a transfer (transfers have no debt direction)", () => {
    expect(getDebtDirection(transferDebt)).toBeNull();
  });

  it("keeps a null debtorUserId for a manual (unlinked) participant on an expense", () => {
    expect(getDebtDirection(manualExpenseDebt)).toEqual({
      debtorUserId: null,
      creditorUserId: "owner-1"
    });
  });

  it("keeps a null creditorUserId for a manual (unlinked) participant on income", () => {
    expect(getDebtDirection(manualIncomeDebt)).toEqual({
      debtorUserId: "owner-1",
      creditorUserId: null
    });
  });
});

describe("isDebtRelevantToUser", () => {
  it("is true for the debtor", () => {
    expect(isDebtRelevantToUser(expenseDebt, "participant-1")).toBe(true);
  });

  it("is true for the creditor", () => {
    expect(isDebtRelevantToUser(expenseDebt, "owner-1")).toBe(true);
  });

  it("is false for an unrelated user", () => {
    expect(isDebtRelevantToUser(expenseDebt, "unrelated-1")).toBe(false);
  });

  it("is true for the owner even with a manual (null userId) participant", () => {
    expect(isDebtRelevantToUser(manualExpenseDebt, "owner-1")).toBe(true);
  });

  it("is false for a transfer (no direction at all)", () => {
    expect(isDebtRelevantToUser(transferDebt, "participant-1")).toBe(false);
  });
});

describe("isSettlementDirectionCurrent", () => {
  it("is true when the settlement's debtor/creditor match the current direction", () => {
    expect(
      isSettlementDirectionCurrent(incomeDebt, {
        debtorUserId: "owner-1",
        creditorUserId: "participant-1"
      })
    ).toBe(true);
  });

  it("is false when the settlement's direction is reversed from current", () => {
    expect(
      isSettlementDirectionCurrent(incomeDebt, {
        debtorUserId: "participant-1",
        creditorUserId: "owner-1"
      })
    ).toBe(false);
  });

  it("is false when the debt has no direction (transfer)", () => {
    expect(
      isSettlementDirectionCurrent(transferDebt, {
        debtorUserId: "owner-1",
        creditorUserId: "participant-1"
      })
    ).toBe(false);
  });
});
