import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { getExchangeRate } from "../../currencies/services/read.service.js";
import { valueInCurrency } from "../../currencies/utils/valuation.js";
import { balanceDebt } from "../utils/debtCalculations.js";
import { debtInclude, publicTransactionSelect } from "../utils/debtInclude.js";
import { isDebtRelevantToUser } from "../utils/debtDirection.js";
import { isCountedShare } from "../utils/shareAcceptance.js";
import { redactGroupForNonMembers } from "../../shared-expenses/utils/groupVisibility.js";
import { buildPersonBalances } from "../utils/personBalances.js";
import { publicUserSelect, publicizeUsers } from "../../users/utils/publicUser.js";

async function withPreferredCurrencyOutstandingAmounts<
  TDebt extends { currency: string; outstandingAmount: Prisma.Decimal }
>(debts: TDebt[], preferredCurrency: string | null) {
  return Promise.all(
    debts.map(async (debt) => {
      if (!preferredCurrency || debt.currency === preferredCurrency) {
        return {
          ...debt,
          outstandingAmountInPreferredCurrency: debt.outstandingAmount.toNumber()
        };
      }

      const rate = await getExchangeRate(debt.currency, preferredCurrency);
      return {
        ...debt,
        outstandingAmountInPreferredCurrency: valueInCurrency(
          debt.outstandingAmount,
          rate,
          preferredCurrency
        ).toNumber()
      };
    })
  );
}

/**
 * Lists the user's debts split into owed-to-me/i-owe/settled (accepted shares only), plus `awaitingAcceptance`
 * (proposed, both sides), `rejectedShares` (owner only), and pending and approved settlement requests, with
 * outstanding amounts converted to their preferred currency. Every row carries `acceptance`; `groupId` is nulled
 * for shared expenses of Groups the viewer is not in.
 */
export async function listDebts(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { preferredCurrency: true }
  });
  const debts = publicizeUsers(await prisma.sharedExpenseParticipant.findMany({
    where: {
      OR: [{ userId }, { sharedExpense: { ownerUserId: userId } }]
    },
    include: debtInclude,
    orderBy: { createdAt: "desc" }
  }));
  const pendingSettlementRequests = publicizeUsers(await prisma.settlementRequest.findMany({
    where: {
      status: "pending",
      OR: [{ debtorUserId: userId }, { creditorUserId: userId }]
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
    },
    orderBy: { createdAt: "desc" }
  }));
  const approvedSettlementRequests = publicizeUsers(await prisma.settlementRequest.findMany({
    where: {
      status: "approved",
      debtorUserId: userId
    },
    include: {
      debtor: { select: publicUserSelect },
      creditor: { select: publicUserSelect },
      sharedExpenseParticipant: {
        include: debtInclude
      }
    },
    orderBy: { approvedAt: "desc" }
  }));

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

  const counted = withBalances.filter(isCountedShare);
  const iOwe = counted.filter(
    (debt) => debt.debtorUserId === userId && debt.outstandingAmount.gt(0)
  );
  const owedToMe = counted.filter(
    (debt) => debt.creditorUserId === userId && debt.outstandingAmount.gt(0)
  );

  return redactGroupForNonMembers(userId, {
    iOwe,
    owedToMe,
    awaitingAcceptance: withBalances.filter((debt) => debt.acceptance === "proposed"),
    rejectedShares: withBalances.filter(
      (debt) => debt.acceptance === "rejected" && debt.sharedExpense.ownerUserId === userId
    ),
    balances: buildPersonBalances(userId, owedToMe, iOwe),
    pendingSettlementRequests,
    approvedSettlementRequests: approvedSettlementRequests.map(
      (request, index) => ({
        ...request,
        sharedExpenseParticipant: approvedSettlementRequestDebts[index]
      })
    ),
    settledDebts: counted.filter((debt) => debt.outstandingAmount.isZero())
  });
}
