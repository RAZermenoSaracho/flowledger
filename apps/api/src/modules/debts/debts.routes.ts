import { settlementRequestSchema } from "@flowledger/shared";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError, notFound } from "../../utils/httpError.js";
import { serialize } from "../../utils/serialize.js";

export const debtsRouter = Router();
export const settlementsRouter = Router();

const publicTransactionSelect = {
  id: true,
  name: true,
  amount: true,
  type: true,
  date: true
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

function debtOutstanding(debt: { shareAmount: Prisma.Decimal; paidAmount: Prisma.Decimal }) {
  return Math.max(0, debt.shareAmount.toNumber() - debt.paidAmount.toNumber());
}

function pendingSettlementTotal(debt: {
  settlementRequests: { status: string; amount: Prisma.Decimal }[];
}) {
  return debt.settlementRequests
    .filter((request) => request.status === "pending")
    .reduce((sum, request) => sum + request.amount.toNumber(), 0);
}

function participantStatus(shareAmount: number, paidAmount: number) {
  if (paidAmount >= shareAmount) return "paid";
  if (paidAmount > 0) return "partial";
  return "pending";
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
        userId,
        sharedExpense: { ownerUserId: { not: userId } }
      },
      include: debtInclude,
      orderBy: { createdAt: "desc" }
    });
    const owedToMe = await prisma.sharedExpenseParticipant.findMany({
      where: {
        userId: { not: null },
        sharedExpense: { ownerUserId: userId }
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

    const withBalances = [...debts, ...owedToMe].map((debt) => ({
      ...debt,
      outstandingAmount: debtOutstanding(debt),
      pendingSettlementAmount: pendingSettlementTotal(debt)
    }));

    res.json(
      serialize({
        iOwe: withBalances.filter((debt) => debt.userId === userId && debt.outstandingAmount > 0),
        owedToMe: withBalances.filter(
          (debt) => debt.sharedExpense.ownerUserId === userId && debt.outstandingAmount > 0
        ),
        pendingSettlementRequests,
        settledDebts: withBalances.filter((debt) => debt.outstandingAmount === 0)
      })
    );
  })
);

debtsRouter.post(
  "/:id/settlement-request",
  validate(settlementRequestSchema),
  asyncHandler(async (req, res) => {
    const debt = await prisma.sharedExpenseParticipant.findFirst({
      where: { id: req.params.id, userId: req.user!.id },
      include: debtInclude
    });
    if (!debt) throw notFound("Debt");

    const outstandingAmount = debtOutstanding(debt);
    const pendingAmount = pendingSettlementTotal(debt);
    const requestAmount = Number(req.body.amount);

    if (outstandingAmount <= 0) {
      throw new HttpError(400, "Debt is already settled");
    }
    if (requestAmount > outstandingAmount - pendingAmount) {
      throw new HttpError(400, "Settlement request exceeds the outstanding balance");
    }

    const settlementRequest = await prisma.settlementRequest.create({
      data: {
        sharedExpenseParticipantId: debt.id,
        debtorUserId: req.user!.id,
        creditorUserId: debt.sharedExpense.ownerUserId,
        amount: new Prisma.Decimal(requestAmount),
        note: req.body.note?.trim() || null
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

    res.status(201).json({ settlementRequest: serialize(settlementRequest) });
  })
);

settlementsRouter.post(
  "/:id/approve",
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
      const outstandingAmount = debtOutstanding(debt);
      const amount = settlementRequest.amount.toNumber();
      if (amount > outstandingAmount) {
        throw new HttpError(400, "Settlement request exceeds the current outstanding balance");
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

      return { settlementRequest: approvedRequest, debt: updatedDebt };
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

    res.json({ settlementRequest: serialize(rejectedRequest) });
  })
);
