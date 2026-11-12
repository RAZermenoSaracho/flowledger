import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { createNotifications } from "../../notifications/services/create.service.js";
import { moneyText } from "../../notifications/utils/moneyText.js";
import { resolveAppliedAmounts } from "../../transactions/utils/appliedAmounts.js";
import { resolveTransactionCurrencyFields } from "../../transactions/utils/transactionCurrency.js";
import {
  balanceDebt,
  debtOutstanding,
  participantStatus,
  settlementNotes
} from "../utils/debtCalculations.js";
import { isCountedShare } from "../utils/shareAcceptance.js";
import {
  getDebtDirection,
  isSettlementDirectionCurrent
} from "../utils/debtDirection.js";
import { debtInclude, publicTransactionSelect } from "../utils/debtInclude.js";
import {
  assertSettlementAccount,
  assertSettlementCategory,
  resolveSettlementExpenseOffsetCategoryId
} from "./settlementValidation.service.js";
import { publicUserSelect, publicizeUsers, userLabel } from "../../users/utils/publicUser.js";


/** Marks a shared expense `settled` once none of its participants have an unpaid balance. */
export async function settleSharedExpenseIfComplete(sharedExpenseId: string) {
  const remainingParticipants = await prisma.sharedExpenseParticipant.count({
    where: {
      sharedExpenseId,
      status: { not: "paid" }
    }
  });

  if (remainingParticipants === 0) {
    await prisma.sharedExpense.update({
      where: { id: sharedExpenseId },
      data: { status: "settled" }
    });
  }
}

/** Marks a debt fully paid by its creditor, bypassing the settlement-request approval flow, and auto-approves any pending requests on it. */
export async function settleDebtDirectly(userId: string, debtId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const debt = await tx.sharedExpenseParticipant.findFirst({
      where: {
        id: debtId,
        OR: [
          { sharedExpense: { ownerUserId: userId, transaction: { type: "expense" } } },
          { userId, sharedExpense: { transaction: { type: "income" } } }
        ]
      },
      include: debtInclude
    });
    if (!debt) throw notFound("Debt");

    if (!isCountedShare(debt)) {
      throw new HttpError(400, "This share has not been accepted");
    }
    const direction = getDebtDirection(debt);
    if (!direction) throw notFound("Debt");

    const outstandingAmount = debtOutstanding(debt);
    if (outstandingAmount.lte(0)) {
      throw new HttpError(400, "Debt is already settled");
    }

    const paidClaim = await tx.sharedExpenseParticipant.updateMany({
      where: { id: debt.id, paidAmount: debt.paidAmount },
      data: { paidAmount: debt.shareAmount, status: "paid" }
    });
    if (paidClaim.count !== 1) throw new HttpError(409, "The debt changed while settling; please retry");
    const updatedDebt = await tx.sharedExpenseParticipant.findUniqueOrThrow({
      where: { id: debt.id },
      include: debtInclude
    });

    await tx.settlementRequest.updateMany({
      where: {
        sharedExpenseParticipantId: debt.id,
        status: "pending"
      },
      data: { status: "approved", approvedAt: new Date() }
    });

    if (direction.debtorUserId) {
      await createNotifications(tx, [
        {
          userId: direction.debtorUserId,
          senderUserId: userId,
          type: "settlement_approved",
          title: "Settlement approved",
          message: `Your settlement for ${debt.sharedExpense.title} was approved.`,
          metadata: {
            sharedExpenseId: debt.sharedExpenseId,
            participantId: debt.id,
            ...(debt.sharedExpense.transaction.groupId
              ? { groupId: debt.sharedExpense.transaction.groupId }
              : {})
          }
        },
        {
          userId: direction.debtorUserId,
          senderUserId: userId,
          type: "settlement_payment_registration_needed",
          title: "Register settlement payment",
          message: `Your settlement for ${debt.sharedExpense.title} was approved. Register the payment as a transaction when ready.`,
          metadata: {
            sharedExpenseId: debt.sharedExpenseId,
            participantId: debt.id,
            ...(debt.sharedExpense.transaction.groupId
              ? { groupId: debt.sharedExpense.transaction.groupId }
              : {})
          }
        }
      ]);
    }

    return { debt: updatedDebt };
  });

  await settleSharedExpenseIfComplete(result.debt.sharedExpenseId);
  return { debt: publicizeUsers(balanceDebt(result.debt)) };
}

/** Approves a pending settlement request and creates the matching debtor-expense/creditor-income transaction pair for it. */
export async function approveSettlement(
  userId: string,
  settlementRequestId: string,
  body: {
    accountId: string;
    accountAmount?: string;
    categoryId: string;
    expenseOffsetCategoryId?: string | null;
  }
) {
  const result = await prisma.$transaction(async (tx) => {
    const settlementRequest = await tx.settlementRequest.findFirst({
      where: {
        id: settlementRequestId,
        creditorUserId: userId,
        status: "pending"
      },
      include: {
        sharedExpenseParticipant: {
          include: {
            sharedExpense: {
              include: {
                owner: { select: publicUserSelect },
                transaction: { select: publicTransactionSelect }
              }
            },
            user: { select: publicUserSelect }
          }
        },
        debtor: { select: publicUserSelect },
        creditor: { select: publicUserSelect }
      }
    });
    if (!settlementRequest) throw notFound("Settlement request");

    const debt = settlementRequest.sharedExpenseParticipant;
    if (!isSettlementDirectionCurrent(debt, settlementRequest)) {
      throw new HttpError(
        400,
        "Settlement request does not match the current debt direction"
      );
    }

    const outstandingAmount = debtOutstanding(debt);
    const amount = settlementRequest.amount;
    if (amount.gt(outstandingAmount)) {
      throw new HttpError(
        400,
        "Settlement request exceeds the current outstanding balance"
      );
    }

    const paidAmount = debt.paidAmount.plus(amount);
    const status = participantStatus(debt.shareAmount, paidAmount);

    const approvedAt = new Date();
    const requestClaim = await tx.settlementRequest.updateMany({
      where: { id: settlementRequest.id, status: "pending" },
      data: { status: "approved", approvedAt }
    });
    if (requestClaim.count !== 1) throw new HttpError(409, "Settlement request was already resolved");
    if (paidAmount.gt(debt.shareAmount)) {
      throw new HttpError(400, "Settlement request exceeds the current outstanding balance");
    }
    const paidClaim = await tx.sharedExpenseParticipant.updateMany({
      where: { id: debt.id, paidAmount: debt.paidAmount },
      data: { paidAmount, status }
    });
    if (paidClaim.count !== 1) throw new HttpError(409, "The debt changed while approving; please retry");
    const updatedDebt = await tx.sharedExpenseParticipant.findUniqueOrThrow({
      where: { id: debt.id },
      include: debtInclude
    });
    const approvedRequest = await tx.settlementRequest.update({
      where: { id: settlementRequest.id },
      data: { status: "approved", approvedAt },
      include: {
        debtor: { select: publicUserSelect },
        creditor: { select: publicUserSelect },
        sharedExpenseParticipant: {
          include: {
            sharedExpense: {
              include: {
                owner: { select: publicUserSelect },
                transaction: { select: publicTransactionSelect }
              }
            },
            user: { select: publicUserSelect }
          }
        }
      }
    });

    if (
      approvedRequest.debtorTransactionId ||
      approvedRequest.creditorTransactionId
    ) {
      throw new HttpError(409, "Settlement transactions already exist");
    }

    if (!settlementRequest.debtorAccountId) {
      throw new HttpError(
        400,
        "Settlement request is missing a source account"
      );
    }
    if (!settlementRequest.debtorCategoryId) {
      throw new HttpError(
        400,
        "Settlement request is missing an expense category"
      );
    }

    const originalTransaction =
      approvedRequest.sharedExpenseParticipant.sharedExpense.transaction;
    const [debtorAccount, creditorAccount] = await Promise.all([
      assertSettlementAccount(
        tx,
        approvedRequest.debtorUserId,
        settlementRequest.debtorAccountId
      ),
      assertSettlementAccount(tx, approvedRequest.creditorUserId, body.accountId)
    ]);
    await assertSettlementCategory(
      tx,
      approvedRequest.creditorUserId,
      body.categoryId,
      "income",
      originalTransaction.groupId
    );
    const expenseOffsetCategoryId = await resolveSettlementExpenseOffsetCategoryId(
      tx,
      {
        userId: approvedRequest.creditorUserId,
        requestedCategoryId:
          originalTransaction.type === "expense"
            ? body.expenseOffsetCategoryId
            : null,
        defaultCategoryId:
          originalTransaction.type === "expense"
            ? originalTransaction.categoryId
            : null,
        groupId: originalTransaction.groupId
      }
    );

    const debtCurrency = debt.currency;
    const [debtorUser, creditorUser] = await Promise.all([
      tx.user.findUniqueOrThrow({
        where: { id: approvedRequest.debtorUserId },
        select: { preferredCurrency: true }
      }),
      tx.user.findUniqueOrThrow({
        where: { id: approvedRequest.creditorUserId },
        select: { preferredCurrency: true }
      })
    ]);
    const settlementAmount = approvedRequest.amount.toFixed();
    const debtorApplied = resolveAppliedAmounts({
      type: "expense",
      amount: settlementAmount,
      executionCurrency: debtCurrency,
      accountCurrency: debtorAccount.currency,
      accountAmount: approvedRequest.debtorAccountAmount?.toFixed()
    });
    const creditorApplied = resolveAppliedAmounts({
      type: "income",
      amount: settlementAmount,
      executionCurrency: debtCurrency,
      accountCurrency: creditorAccount.currency,
      accountAmount: body.accountAmount
    });
    const [debtorCurrencyFields, creditorCurrencyFields] = await Promise.all([
      resolveTransactionCurrencyFields({
        executionCurrency: debtCurrency,
        amount: approvedRequest.amount,
        preferredCurrency: debtorUser.preferredCurrency
      }),
      resolveTransactionCurrencyFields({
        executionCurrency: debtCurrency,
        amount: approvedRequest.amount,
        preferredCurrency: creditorUser.preferredCurrency
      })
    ]);

    const transactionDate = approvedRequest.approvedAt ?? new Date();
    const transactionName = `Settlement: ${approvedRequest.sharedExpenseParticipant.sharedExpense.title}`;
    const notes = settlementNotes({
      note: approvedRequest.note,
      paymentInfo: approvedRequest.paymentInfo
    });
    const debtorTransaction = await tx.transaction.create({
      data: {
        userId: approvedRequest.debtorUserId,
        name: transactionName,
        amount: approvedRequest.amount,
        ...debtorCurrencyFields,
        ...debtorApplied,
        type: "expense",
        date: transactionDate,
        accountId: settlementRequest.debtorAccountId,
        categoryId: settlementRequest.debtorCategoryId,
        groupId:
          approvedRequest.sharedExpenseParticipant.sharedExpense.transaction
            .groupId,
        notes: notes || null
      }
    });
    const creditorTransaction = await tx.transaction.create({
      data: {
        userId: approvedRequest.creditorUserId,
        name: transactionName,
        amount: approvedRequest.amount,
        ...creditorCurrencyFields,
        ...creditorApplied,
        type: "income",
        accountId: body.accountId,
        categoryId: body.categoryId,
        date: transactionDate,
        groupId:
          approvedRequest.sharedExpenseParticipant.sharedExpense.transaction
            .groupId,
        expenseOffsetCategoryId,
        notes: notes || null
      }
    });

    await tx.transactionRelation.createMany({
      data: [
        {
          transactionId: debtorTransaction.id,
          relatedTransactionId: creditorTransaction.id,
          relationType: "settlement_payment"
        },
        {
          transactionId: creditorTransaction.id,
          relatedTransactionId: debtorTransaction.id,
          relationType: "settlement_payment"
        }
      ]
    });

    const approvedRequestWithTransactions = await tx.settlementRequest.update({
      where: { id: approvedRequest.id },
      data: {
        creditorAccountId: body.accountId,
        creditorCategoryId: body.categoryId,
        debtorTransactionId: debtorTransaction.id,
        creditorTransactionId: creditorTransaction.id
      },
      include: {
        debtor: { select: publicUserSelect },
        creditor: { select: publicUserSelect },
        sharedExpenseParticipant: {
          include: {
            sharedExpense: {
              include: {
                owner: { select: publicUserSelect },
                transaction: { select: publicTransactionSelect }
              }
            },
            user: { select: publicUserSelect }
          }
        }
      }
    });

    await createNotifications(tx, [
      {
        userId: approvedRequestWithTransactions.debtorUserId,
        senderUserId: userId,
          type: "settlement_approved",
        title: "Settlement approved",
        message: `${userLabel(approvedRequestWithTransactions.creditor)} approved your ${moneyText(
          approvedRequestWithTransactions.amount,
          debtCurrency
        )} settlement for ${approvedRequestWithTransactions.sharedExpenseParticipant.sharedExpense.title}. A transaction was created automatically.`,
        metadata: {
          settlementRequestId: approvedRequestWithTransactions.id,
          sharedExpenseId:
            approvedRequestWithTransactions.sharedExpenseParticipant
              .sharedExpenseId,
          participantId:
            approvedRequestWithTransactions.sharedExpenseParticipantId,
          debtorTransactionId: debtorTransaction.id,
          creditorTransactionId: creditorTransaction.id,
          ...(approvedRequestWithTransactions.sharedExpenseParticipant
            .sharedExpense.transaction.groupId
            ? {
                groupId:
                  approvedRequestWithTransactions.sharedExpenseParticipant
                    .sharedExpense.transaction.groupId
              }
            : {})
        }
      }
    ]);

    return {
      settlementRequest: approvedRequestWithTransactions,
      debt: updatedDebt
    };
  });

  await settleSharedExpenseIfComplete(result.debt.sharedExpenseId);
  return publicizeUsers({
    settlementRequest: result.settlementRequest,
    debt: balanceDebt(result.debt)
  });
}

/** Approves each entry in `approvals` sequentially, reusing {@link approveSettlement}. */
export async function approveBatchSettlements(
  userId: string,
  approvals: {
    settlementRequestId: string;
    accountId: string;
    accountAmount?: string;
    categoryId: string;
    expenseOffsetCategoryId?: string | null;
  }[]
) {
  const results = [];
  for (const approval of approvals) {
    results.push(
      await approveSettlement(userId, approval.settlementRequestId, approval)
    );
  }

  return results;
}

/** Rejects a pending settlement request the caller is the creditor on. */
export async function rejectSettlement(
  userId: string,
  settlementRequestId: string
) {
  const settlementRequest = await prisma.settlementRequest.findFirst({
    where: {
      id: settlementRequestId,
      creditorUserId: userId,
      status: "pending"
    }
  });
  if (!settlementRequest) throw notFound("Settlement request");

  const rejectedRequest = await prisma.settlementRequest.update({
    where: { id: settlementRequest.id },
    data: { status: "rejected" },
    include: {
      debtor: { select: publicUserSelect },
      creditor: { select: publicUserSelect },
      sharedExpenseParticipant: {
        include: {
          sharedExpense: {
            include: {
              owner: { select: publicUserSelect },
              transaction: { select: publicTransactionSelect }
            }
          },
          user: { select: publicUserSelect }
        }
      }
    }
  });

  await createNotifications(prisma, [
    {
      userId: rejectedRequest.debtorUserId,
      senderUserId: userId,
      type: "settlement_rejected",
      title: "Settlement rejected",
      message: `${userLabel(rejectedRequest.creditor)} rejected your ${moneyText(
        rejectedRequest.amount,
        rejectedRequest.sharedExpenseParticipant.currency
      )} settlement for ${rejectedRequest.sharedExpenseParticipant.sharedExpense.title}.`,
      metadata: {
        settlementRequestId: rejectedRequest.id,
        sharedExpenseId:
          rejectedRequest.sharedExpenseParticipant.sharedExpenseId,
        participantId: rejectedRequest.sharedExpenseParticipantId,
        ...(rejectedRequest.sharedExpenseParticipant.sharedExpense.transaction
          .groupId
          ? {
              groupId:
                rejectedRequest.sharedExpenseParticipant.sharedExpense
                  .transaction.groupId
            }
          : {})
      }
    }
  ]);

  return publicizeUsers(rejectedRequest);
}
