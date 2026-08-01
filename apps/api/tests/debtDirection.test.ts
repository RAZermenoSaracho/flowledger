import assert from "node:assert/strict";
import {
  getDebtDirection,
  isDebtRelevantToUser,
  isSettlementDirectionCurrent
} from "../src/modules/debts/utils/debtDirection.ts";

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

assert.deepEqual(getDebtDirection(expenseDebt), {
  debtorUserId: "participant-1",
  creditorUserId: "owner-1"
});

assert.deepEqual(getDebtDirection(incomeDebt), {
  debtorUserId: "owner-1",
  creditorUserId: "participant-1"
});

assert.deepEqual(getDebtDirection(manualExpenseDebt), {
  debtorUserId: null,
  creditorUserId: "owner-1"
});

assert.deepEqual(getDebtDirection(manualIncomeDebt), {
  debtorUserId: "owner-1",
  creditorUserId: null
});

assert.equal(isDebtRelevantToUser(expenseDebt, "participant-1"), true);
assert.equal(isDebtRelevantToUser(expenseDebt, "owner-1"), true);
assert.equal(isDebtRelevantToUser(expenseDebt, "unrelated-1"), false);
assert.equal(isDebtRelevantToUser(manualExpenseDebt, "owner-1"), true);
assert.equal(isDebtRelevantToUser(manualExpenseDebt, "unrelated-1"), false);

assert.equal(
  isSettlementDirectionCurrent(incomeDebt, {
    debtorUserId: "owner-1",
    creditorUserId: "participant-1"
  }),
  true
);
assert.equal(
  isSettlementDirectionCurrent(incomeDebt, {
    debtorUserId: "participant-1",
    creditorUserId: "owner-1"
  }),
  false
);
