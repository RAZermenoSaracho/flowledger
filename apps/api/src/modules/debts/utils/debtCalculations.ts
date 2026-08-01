import type { Prisma } from "@prisma/client";
import { getDebtDirection, isSettlementDirectionCurrent } from "./debtDirection.js";
import type { debtInclude } from "./debtInclude.js";

export function debtOutstanding(debt: {
  shareAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
}) {
  return Math.max(0, debt.shareAmount.toNumber() - debt.paidAmount.toNumber());
}

export function pendingSettlementTotal(debt: {
  userId: string | null;
  sharedExpense: {
    ownerUserId: string;
    transaction: { type: "income" | "expense" | "transfer" };
  };
  settlementRequests: {
    status: string;
    amount: Prisma.Decimal;
    debtorUserId: string;
    creditorUserId: string;
  }[];
}) {
  const direction = getDebtDirection(debt);
  if (!direction) return 0;

  return debt.settlementRequests
    .filter(
      (request) =>
        request.status === "pending" &&
        isSettlementDirectionCurrent(debt, request)
    )
    .reduce((sum, request) => sum + request.amount.toNumber(), 0);
}

export function balanceDebt(
  debt: Prisma.SharedExpenseParticipantGetPayload<{
    include: typeof debtInclude;
  }>
) {
  const direction = getDebtDirection(debt);
  return {
    ...debt,
    debtorUserId: direction?.debtorUserId,
    creditorUserId: direction?.creditorUserId,
    outstandingAmount: debtOutstanding(debt),
    pendingSettlementAmount: pendingSettlementTotal(debt)
  };
}

export function participantStatus(shareAmount: number, paidAmount: number) {
  if (paidAmount >= shareAmount) return "paid";
  if (paidAmount > 0) return "partial";
  return "pending";
}

export function settlementNotes(input: {
  note: string | null;
  paymentInfo: string | null;
}) {
  return [
    input.note,
    input.paymentInfo ? `Payment info: ${input.paymentInfo}` : null
  ]
    .filter(Boolean)
    .join("\n");
}
