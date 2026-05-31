import {
  directSettlementSchema,
  settlementApprovalSchema,
  settlementRequestSchema
} from "@flowledger/shared";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError, notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";
import {
  createNotifications,
  moneyText
} from "../notifications/notifications.service.js";
import {
  getDebtDirection,
  isDebtRelevantToUser,
  isSettlementDirectionCurrent
} from "./debtDirection.js";

export const debtsRouter = Router();
export const settlementsRouter = Router();

const publicTransactionSelect = {
  id: true,
  name: true,
  amount: true,
  type: true,
  date: true,
  categoryId: true,
  expenseOffsetCategoryId: true,
  groupId: true
};

const debtInclude = {
  sharedExpense: {
    include: {
      owner: { select: { id: true, name: true, email: true } },
      transaction: { select: publicTransactionSelect }
    }
  },
  user: { select: { id: true, name: true, email: true } },
  settlementRequests: {
    orderBy: { createdAt: "desc" as const },
    include: {
      debtor: { select: { id: true, name: true, email: true } },
      creditor: { select: { id: true, name: true, email: true } }
    }
  }
};

function debtOutstanding(debt: {
  shareAmount: Prisma.Decimal;
  paidAmount: Prisma.Decimal;
}) {
  return Math.max(0, debt.shareAmount.toNumber() - debt.paidAmount.toNumber());
}

function pendingSettlementTotal(debt: {
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

function balanceDebt(
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

function participantStatus(shareAmount: number, paidAmount: number) {
  if (paidAmount >= shareAmount) return "paid";
  if (paidAmount > 0) return "partial";
  return "pending";
}

async function assertSettlementAccount(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  accountId: string
) {
  const account = await client.account.findFirst({
    where: { id: accountId, userId, isArchived: false }
  });
  if (!account) {
    throw new HttpError(400, "Account does not exist or is archived");
  }
}

async function assertSettlementCategory(
  client: Prisma.TransactionClient | typeof prisma,
  userId: string,
  categoryId: string,
  type: "income" | "expense",
  groupId?: string | null
) {
  if (groupId) {
    const category = await client.category.findFirst({
      where: {
        id: categoryId,
        type,
        groupId,
        isArchived: false,
        users: { some: { userId } }
      }
    });
    if (!category) {
      throw new HttpError(400, "Category does not exist or is archived");
    }
    return;
  }

  const category = await client.category.findFirst({
    where: {
      id: categoryId,
      type,
      groupId: null,
      isArchived: false,
      users: { some: { userId } }
    }
  });
  if (!category) {
    throw new HttpError(400, "Category does not exist or is archived");
  }
}

async function findSettlementExpenseOffsetCategory(
  tx: Prisma.TransactionClient,
  userId: string,
  categoryId?: string | null,
  groupId?: string | null
) {
  if (!categoryId) return null;

  return tx.category.findFirst({
    where: {
      id: categoryId,
      type: "expense",
      groupId: groupId ?? null,
      isArchived: false,
      users: { some: { userId } },
      ...(groupId ? { group: { isArchived: false } } : {})
    }
  });
}

async function resolveSettlementExpenseOffsetCategoryId(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    requestedCategoryId?: string | null;
    defaultCategoryId?: string | null;
    groupId?: string | null;
  }
) {
  if (input.requestedCategoryId !== undefined) {
    const category = await findSettlementExpenseOffsetCategory(
      tx,
      input.userId,
      input.requestedCategoryId,
      input.groupId
    );
    if (input.requestedCategoryId && !category) {
      throw new HttpError(
        400,
        "Expense offset category does not exist or is archived"
      );
    }
    return category?.id ?? null;
  }

  const category = await findSettlementExpenseOffsetCategory(
    tx,
    input.userId,
    input.defaultCategoryId,
    input.groupId
  );
  return category?.id ?? null;
}

function settlementNotes(input: {
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

async function settleSharedExpenseIfComplete(sharedExpenseId: string) {
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

debtsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const debts = await prisma.sharedExpenseParticipant.findMany({
      where: {
        OR: [{ userId }, { sharedExpense: { ownerUserId: userId } }]
      },
      include: debtInclude,
      orderBy: { createdAt: "desc" }
    });
    const pendingSettlementRequests = await prisma.settlementRequest.findMany({
      where: {
        status: "pending",
        OR: [{ debtorUserId: userId }, { creditorUserId: userId }]
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
      },
      orderBy: { createdAt: "desc" }
    });
    const approvedSettlementRequests = await prisma.settlementRequest.findMany({
      where: {
        status: "approved",
        debtorUserId: userId
      },
      include: {
        debtor: { select: { id: true, name: true, email: true } },
        creditor: { select: { id: true, name: true, email: true } },
        sharedExpenseParticipant: {
          include: debtInclude
        }
      },
      orderBy: { approvedAt: "desc" }
    });

    const withBalances = debts
      .filter((debt) => isDebtRelevantToUser(debt, userId))
      .map((debt) => balanceDebt(debt));

    res.json(
      serialize({
        iOwe: withBalances.filter(
          (debt) => debt.debtorUserId === userId && debt.outstandingAmount > 0
        ),
        owedToMe: withBalances.filter(
          (debt) => debt.creditorUserId === userId && debt.outstandingAmount > 0
        ),
        pendingSettlementRequests,
        approvedSettlementRequests: approvedSettlementRequests.map(
          (request) => ({
            ...request,
            sharedExpenseParticipant: balanceDebt(
              request.sharedExpenseParticipant
            )
          })
        ),
        settledDebts: withBalances.filter(
          (debt) => debt.outstandingAmount === 0
        )
      })
    );
  })
);

debtsRouter.post(
  "/:id/settlement-request",
  validate(settlementRequestSchema),
  asyncHandler(async (req, res) => {
    const debt = await prisma.sharedExpenseParticipant.findFirst({
      where: { id: req.params.id, userId: { not: null } },
      include: debtInclude
    });
    if (!debt) throw notFound("Debt");

    const direction = getDebtDirection(debt);
    if (!direction || direction.debtorUserId !== req.user!.id) {
      throw notFound("Debt");
    }
    if (!direction.creditorUserId) {
      throw notFound("Debt");
    }

    const outstandingAmount = debtOutstanding(debt);
    const pendingAmount = pendingSettlementTotal(debt);
    const requestAmount = Number(req.body.amount);
    await assertSettlementAccount(prisma, req.user!.id, req.body.accountId);
    await assertSettlementCategory(
      prisma,
      req.user!.id,
      req.body.categoryId,
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
        debtorUserId: req.user!.id,
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
        debtorUserId: req.user!.id,
        creditorUserId: direction.creditorUserId,
        amount: new Prisma.Decimal(requestAmount),
        debtorAccountId: req.body.accountId,
        debtorCategoryId: req.body.categoryId || null,
        note: req.body.note?.trim() || null,
        paymentInfo: req.body.paymentInfo?.trim() || null
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

    res.status(201).json({ settlementRequest: serialize(settlementRequest) });
  })
);

debtsRouter.post(
  "/:id/settle",
  validate(directSettlementSchema),
  asyncHandler(async (req, res) => {
    const result = await prisma.$transaction(async (tx) => {
      const debt = await tx.sharedExpenseParticipant.findFirst({
        where: { id: req.params.id },
        include: debtInclude
      });
      if (!debt) throw notFound("Debt");

      const direction = getDebtDirection(debt);
      if (!direction || direction.creditorUserId !== req.user!.id) {
        throw notFound("Debt");
      }

      const outstandingAmount = debtOutstanding(debt);
      if (outstandingAmount <= 0) {
        throw new HttpError(400, "Debt is already settled");
      }

      const updatedDebt = await tx.sharedExpenseParticipant.update({
        where: { id: debt.id },
        data: {
          paidAmount: debt.shareAmount,
          status: "paid"
        },
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
    res.json(serialize({ debt: balanceDebt(result.debt) }));
  })
);

settlementsRouter.post(
  "/:id/approve",
  validate(settlementApprovalSchema),
  asyncHandler(async (req, res) => {
    const result = await prisma.$transaction(async (tx) => {
      const settlementRequest = await tx.settlementRequest.findFirst({
        where: {
          id: req.params.id,
          creditorUserId: req.user!.id,
          status: "pending"
        },
        include: {
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
          },
          debtor: { select: { id: true, name: true, email: true } },
          creditor: { select: { id: true, name: true, email: true } }
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
      const amount = settlementRequest.amount.toNumber();
      if (amount > outstandingAmount) {
        throw new HttpError(
          400,
          "Settlement request exceeds the current outstanding balance"
        );
      }

      const paidAmount = debt.paidAmount.toNumber() + amount;
      const status = participantStatus(debt.shareAmount.toNumber(), paidAmount);

      const updatedDebt = await tx.sharedExpenseParticipant.update({
        where: { id: debt.id },
        data: {
          paidAmount: new Prisma.Decimal(paidAmount),
          status
        },
        include: debtInclude
      });
      const approvedRequest = await tx.settlementRequest.update({
        where: { id: settlementRequest.id },
        data: { status: "approved", approvedAt: new Date() },
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
      await assertSettlementAccount(
        tx,
        approvedRequest.creditorUserId,
        req.body.accountId
      );
      await assertSettlementCategory(
        tx,
        approvedRequest.creditorUserId,
        req.body.categoryId,
        "income",
        originalTransaction.groupId
      );
      const expenseOffsetCategoryId =
        await resolveSettlementExpenseOffsetCategoryId(tx, {
          userId: approvedRequest.creditorUserId,
          requestedCategoryId:
            originalTransaction.type === "expense"
              ? req.body.expenseOffsetCategoryId
              : null,
          defaultCategoryId:
            originalTransaction.type === "expense"
              ? originalTransaction.categoryId
              : null,
          groupId: originalTransaction.groupId
        });

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
          type: "income",
          accountId: req.body.accountId,
          categoryId: req.body.categoryId,
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

      const approvedRequestWithTransactions = await tx.settlementRequest.update(
        {
          where: { id: approvedRequest.id },
          data: {
            creditorAccountId: req.body.accountId,
            creditorCategoryId: req.body.categoryId,
            debtorTransactionId: debtorTransaction.id,
            creditorTransactionId: creditorTransaction.id
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
        }
      );

      await createNotifications(tx, [
        {
          userId: approvedRequestWithTransactions.debtorUserId,
          type: "settlement_approved",
          title: "Settlement approved",
          message: `${approvedRequestWithTransactions.creditor.name} approved your ${moneyText(
            approvedRequestWithTransactions.amount
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
    res.json(serialize(result));
  })
);

settlementsRouter.post(
  "/:id/reject",
  asyncHandler(async (req, res) => {
    const settlementRequest = await prisma.settlementRequest.findFirst({
      where: {
        id: req.params.id,
        creditorUserId: req.user!.id,
        status: "pending"
      }
    });
    if (!settlementRequest) throw notFound("Settlement request");

    const rejectedRequest = await prisma.settlementRequest.update({
      where: { id: settlementRequest.id },
      data: { status: "rejected" },
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
        userId: rejectedRequest.debtorUserId,
        type: "settlement_rejected",
        title: "Settlement rejected",
        message: `${rejectedRequest.creditor.name} rejected your ${moneyText(
          rejectedRequest.amount
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

    res.json({ settlementRequest: serialize(rejectedRequest) });
  })
);
