import { Prisma } from "@prisma/client";
import { getDebtDirection, isSettlementDirectionCurrent } from "./debtDirection.js";
import type { debtInclude } from "./debtInclude.js";

/** Remaining unpaid amount on a debt in its own currency, floored at 0 (exact `Decimal`). */
export function debtOutstanding(debt: {
  shareAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
}) {
  return Prisma.Decimal.max(0, debt.shareAmount.minus(debt.paidAmount));
}

/** Sums a debt's pending settlement requests that still match its current debtor/creditor direction. */
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
  if (!direction) return new Prisma.Decimal(0);

  return debt.settlementRequests
    .filter(
      (request) =>
        request.status === "pending" &&
        isSettlementDirectionCurrent(debt, request)
    )
    .reduce((sum, request) => sum.plus(request.amount), new Prisma.Decimal(0));
}

/** Enriches a Prisma debt row (loaded via {@link debtInclude}) with resolved direction and outstanding/pending amounts for balance views. */
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

/** Derives a participant's paid status by comparing `paidAmount` against `shareAmount`. */
export function participantStatus(shareAmount: Prisma.Decimal.Value, paidAmount: Prisma.Decimal.Value) {
  const paid = new Prisma.Decimal(paidAmount);
  if (paid.gte(shareAmount)) return "paid";
  if (paid.gt(0)) return "partial";
  return "pending";
}

/** Joins a settlement's free-text note and payment info into a single display string. */
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
