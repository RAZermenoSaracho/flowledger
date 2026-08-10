import { prisma } from "../../../db/prisma.js";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { roundMoney } from "../../currencies/utils/roundMoney.js";
import { balanceDebt } from "../utils/debtCalculations.js";
import { debtInclude, publicTransactionSelect } from "../utils/debtInclude.js";
import { isDebtRelevantToUser } from "../utils/debtDirection.js";
import { buildPersonBalances } from "../utils/personBalances.js";

async function withPreferredCurrencyOutstandingAmounts<
  TDebt extends { currency: string; outstandingAmount: number }
>(debts: TDebt[], preferredCurrency: string | null) {
  return Promise.all(
    debts.map(async (debt) => {
      if (!preferredCurrency || debt.currency === preferredCurrency) {
        return {
          ...debt,
          outstandingAmountInPreferredCurrency: debt.outstandingAmount
        };
      }

      const rate = await getExchangeRate(debt.currency, preferredCurrency);
      return {
        ...debt,
        outstandingAmountInPreferredCurrency: roundMoney(
          debt.outstandingAmount * rate
        )
      };
    })
  );
}

/** Lists the user's debts split into owed-to-me/i-owe/settled, plus pending and approved settlement requests, with outstanding amounts converted to their preferred currency. */
export async function listDebts(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferredCurrency: true }
  });
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

  const withBalances = await withPreferredCurrencyOutstandingAmounts(
    debts
      .filter((debt) => isDebtRelevantToUser(debt, userId))
      .map((debt) => balanceDebt(debt)),
    user.preferredCurrency
  );

  const approvedSettlementRequestDebts =
    await withPreferredCurrencyOutstandingAmounts(
      approvedSettlementRequests.map((request) =>
        balanceDebt(request.sharedExpenseParticipant)
      ),
      user.preferredCurrency
    );

  const iOwe = withBalances.filter(
    (debt) => debt.debtorUserId === userId && debt.outstandingAmount > 0
  );
  const owedToMe = withBalances.filter(
    (debt) => debt.creditorUserId === userId && debt.outstandingAmount > 0
  );

  return {
    iOwe,
    owedToMe,
    balances: buildPersonBalances(userId, owedToMe, iOwe),
    pendingSettlementRequests,
    approvedSettlementRequests: approvedSettlementRequests.map(
      (request, index) => ({
        ...request,
        sharedExpenseParticipant: approvedSettlementRequestDebts[index]
      })
    ),
    settledDebts: withBalances.filter((debt) => debt.outstandingAmount === 0)
  };
}
