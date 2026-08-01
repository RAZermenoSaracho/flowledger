type DebtDirectionInput = {
  userId: string | null;
  sharedExpense: {
    ownerUserId: string;
    transaction: {
      type: "income" | "expense" | "transfer";
    };
  };
};

export type DebtDirection = {
  debtorUserId: string | null;
  creditorUserId: string | null;
};

export function getDebtDirection(debt: DebtDirectionInput): DebtDirection | null {
  const participantUserId = debt.userId;

  if (debt.sharedExpense.transaction.type === "expense") {
    return {
      debtorUserId: participantUserId,
      creditorUserId: debt.sharedExpense.ownerUserId
    };
  }

  if (debt.sharedExpense.transaction.type === "income") {
    return {
      debtorUserId: debt.sharedExpense.ownerUserId,
      creditorUserId: participantUserId
    };
  }

  return null;
}

export function isDebtRelevantToUser(debt: DebtDirectionInput, userId: string) {
  const direction = getDebtDirection(debt);
  return direction?.debtorUserId === userId || direction?.creditorUserId === userId;
}

export function isSettlementDirectionCurrent(
  debt: DebtDirectionInput,
  settlementRequest: { debtorUserId: string; creditorUserId: string }
) {
  const direction = getDebtDirection(debt);
  return (
    direction?.debtorUserId === settlementRequest.debtorUserId &&
    direction.creditorUserId === settlementRequest.creditorUserId
  );
}
