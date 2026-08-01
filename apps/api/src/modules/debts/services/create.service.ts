import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { HttpError, notFound } from "../../../utils/httpError.js";
import { createNotifications } from "../../notifications/services/create.service.js";
import { moneyText } from "../../notifications/utils/moneyText.js";
import { debtOutstanding, pendingSettlementTotal } from "../utils/debtCalculations.js";
import { getDebtDirection } from "../utils/debtDirection.js";
import { debtInclude, publicTransactionSelect } from "../utils/debtInclude.js";
import {
  assertSettlementAccount,
  assertSettlementCategory
} from "../utils/settlementValidation.js";

export async function createSettlementRequest(
  userId: string,
  debtId: string,
  body: {
    amount: number | string;
    accountId: string;
    categoryId?: string;
    note?: string | null;
    paymentInfo?: string | null;
  }
) {
  const debt = await prisma.sharedExpenseParticipant.findFirst({
    where: { id: debtId, userId: { not: null } },
    include: debtInclude
  });
  if (!debt) throw notFound("Debt");

  const direction = getDebtDirection(debt);
  if (!direction || direction.debtorUserId !== userId) {
    throw notFound("Debt");
  }
  if (!direction.creditorUserId) {
    throw notFound("Debt");
  }

  const outstandingAmount = debtOutstanding(debt);
  const pendingAmount = pendingSettlementTotal(debt);
  const requestAmount = Number(body.amount);
  await assertSettlementAccount(prisma, userId, body.accountId);
  await assertSettlementCategory(
    prisma,
    userId,
    body.categoryId!,
    "expense",
    debt.sharedExpense.transaction.groupId
  );

  if (outstandingAmount <= 0) {
    throw new HttpError(400, "Debt is already settled");
  }
  if (requestAmount > outstandingAmount - pendingAmount) {
    throw new HttpError(
      400,
      "Settlement request exceeds the outstanding balance"
    );
  }

  const duplicateRequest = await prisma.settlementRequest.findFirst({
    where: {
      sharedExpenseParticipantId: debt.id,
      debtorUserId: userId,
      creditorUserId: direction.creditorUserId,
      status: "pending"
    }
  });
  if (duplicateRequest) {
    throw new HttpError(
      409,
      "A pending settlement request already exists for this debt"
    );
  }

  const settlementRequest = await prisma.settlementRequest.create({
    data: {
      sharedExpenseParticipantId: debt.id,
      debtorUserId: userId,
      creditorUserId: direction.creditorUserId,
      amount: new Prisma.Decimal(requestAmount),
      debtorAccountId: body.accountId,
      debtorCategoryId: body.categoryId || null,
      note: body.note?.trim() || null,
      paymentInfo: body.paymentInfo?.trim() || null
    },
    include: {
      debtor: { select: { id: true, name: true, email: true } },
      creditor: { select: { id: true, name: true, email: true } },
      sharedExpenseParticipant: {
        include: {
          sharedExpense: {
            include: {
              owner: { select: { id: true, name: true, email: true } },
              transaction: { select: publicTransactionSelect }
            }
          },
          user: { select: { id: true, name: true, email: true } }
        }
      }
    }
  });

  await createNotifications(prisma, [
    {
      userId: settlementRequest.creditorUserId,
      type: "settlement_requested",
      title: "Settlement requested",
      message: `${settlementRequest.debtor.name} requested settlement of ${moneyText(
        settlementRequest.amount
      )} for ${settlementRequest.sharedExpenseParticipant.sharedExpense.title}.`,
      metadata: {
        settlementRequestId: settlementRequest.id,
        sharedExpenseId:
          settlementRequest.sharedExpenseParticipant.sharedExpenseId,
        participantId: settlementRequest.sharedExpenseParticipantId,
        ...(settlementRequest.sharedExpenseParticipant.sharedExpense
          .transaction.groupId
          ? {
              groupId:
                settlementRequest.sharedExpenseParticipant.sharedExpense
                  .transaction.groupId
            }
          : {})
      }
    }
  ]);

  return settlementRequest;
}

export async function createBatchSettlementRequests(
  userId: string,
  requests: {
    debtId: string;
    amount: number | string;
    accountId: string;
    categoryId?: string;
    note?: string | null;
    paymentInfo?: string | null;
  }[]
) {
  const settlementRequests = [];
  for (const request of requests) {
    settlementRequests.push(
      await createSettlementRequest(userId, request.debtId, request)
    );
  }

  return settlementRequests;
}
