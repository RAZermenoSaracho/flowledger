import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { notFound } from "../../../utils/httpError.js";
import {
  importedTransactionInclude,
  importedTransactionOrderBy,
  importedTransactionWhere
} from "../utils/importedTransactionQuery.js";
import type { ImportedTransactionFilters } from "../types/transactions.types.js";

const settlementTransactionWhere: Prisma.TransactionWhereInput = {
  OR: [
    { debtorSettlementRequest: { isNot: null } },
    { creditorSettlementRequest: { isNot: null } },
    { relations: { some: { relationType: "settlement_payment" } } },
    { relatedBy: { some: { relationType: "settlement_payment" } } }
  ]
};

const expenseOffsetTransactionWhere: Prisma.TransactionWhereInput = {
  expenseOffsetCategoryId: { not: null }
};

function transactionFilterTypeWhere(
  transactionFilterType?: "normal" | "settlement" | "expenseOffset"
): Prisma.TransactionWhereInput | null {
  if (transactionFilterType === "settlement") {
    return settlementTransactionWhere;
  }

  if (transactionFilterType === "expenseOffset") {
    return expenseOffsetTransactionWhere;
  }

  if (transactionFilterType === "normal") {
    return {
      NOT: [settlementTransactionWhere, expenseOffsetTransactionWhere]
    };
  }

  return null;
}

export type TransactionListFilters = {
  dateFrom?: string;
  dateTo?: string;
  amountFrom?: number;
  amountTo?: number;
  categoryId?: string;
  categoryIds?: string[];
  groupId?: string;
  groupIds?: string[];
  accountId?: string;
  accountIds?: string[];
  executionCurrency?: string;
  executionCurrencies?: string[];
  type?: "income" | "expense" | "transfer";
  types?: ("income" | "expense" | "transfer")[];
  transactionFilterType?: "normal" | "settlement" | "expenseOffset";
  classification?: "complete" | "needsClassification";
  search?: string;
  sortBy?: "date" | "createdAt" | "name" | "amount";
  sortDirection?: "asc" | "desc";
  limit?: number;
};

function transactionWhere(userId: string, filters: TransactionListFilters) {
  const andFilters: Prisma.TransactionWhereInput[] = [];
  const transactionFilterType = transactionFilterTypeWhere(
    filters.transactionFilterType
  );

  if (transactionFilterType) {
    andFilters.push(transactionFilterType);
  }

  if (filters.classification === "needsClassification") {
    andFilters.push({
      OR: [
        {
          type: "transfer",
          OR: [{ accountId: null }, { transferToAccountId: null }]
        },
        {
          type: { not: "transfer" },
          OR: [{ accountId: null }, { categoryId: null }]
        }
      ]
    });
  }

  if (filters.classification === "complete") {
    andFilters.push({
      OR: [
        {
          type: "transfer",
          accountId: { not: null },
          transferToAccountId: { not: null }
        },
        {
          type: { not: "transfer" },
          accountId: { not: null },
          categoryId: { not: null }
        }
      ]
    });
  }

  if (filters.accountId) {
    andFilters.push({
      OR: [
        { accountId: filters.accountId },
        { transferToAccountId: filters.accountId }
      ]
    });
  }

  return {
    userId,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.categoryIds?.length
      ? { categoryId: { in: filters.categoryIds } }
      : {}),
    ...(filters.groupId ? { groupId: filters.groupId } : {}),
    ...(filters.groupIds?.length ? { groupId: { in: filters.groupIds } } : {}),
    ...(filters.accountIds?.length
      ? { accountId: { in: filters.accountIds } }
      : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.types?.length ? { type: { in: filters.types } } : {}),
    ...(filters.executionCurrency
      ? { executionCurrency: filters.executionCurrency }
      : {}),
    ...(filters.executionCurrencies?.length
      ? { executionCurrency: { in: filters.executionCurrencies } }
      : {}),
    ...(andFilters.length > 0 ? { AND: andFilters } : {}),
    ...(filters.search
      ? {
          OR: [
            { name: { contains: filters.search, mode: "insensitive" } },
            { notes: { contains: filters.search, mode: "insensitive" } }
          ]
        }
      : {}),
    ...(filters.amountFrom !== undefined || filters.amountTo !== undefined
      ? {
          amount: {
            ...(filters.amountFrom !== undefined
              ? { gte: filters.amountFrom }
              : {}),
            ...(filters.amountTo !== undefined
              ? { lte: filters.amountTo }
              : {})
          }
        }
      : {}),
    ...(filters.dateFrom || filters.dateTo
      ? {
          date: {
            ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
            ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {})
          }
        }
      : {})
  } satisfies Prisma.TransactionWhereInput;
}

function transactionOrderBy(
  filters: Pick<TransactionListFilters, "sortBy" | "sortDirection">
): Prisma.TransactionOrderByWithRelationInput {
  if (filters.sortBy) {
    return { [filters.sortBy]: filters.sortDirection ?? "asc" };
  }

  return { date: "desc" };
}

export async function listTransactions(
  userId: string,
  filters: TransactionListFilters
) {
  return prisma.transaction.findMany({
    where: transactionWhere(userId, filters),
    include: {
      account: true,
      transferToAccount: true,
      category: true,
      expenseOffsetCategory: true,
      group: true
    },
    orderBy: transactionOrderBy(filters),
    ...(filters.limit ? { take: filters.limit } : {})
  });
}

export async function getTransactionsSummary(
  userId: string,
  filters: TransactionListFilters
) {
  const where = transactionWhere(userId, filters);
  const includesIncome =
    (!filters.type || filters.type === "income") &&
    (!filters.types?.length || filters.types.includes("income"));
  const includesExpense =
    (!filters.type || filters.type === "expense") &&
    (!filters.types?.length || filters.types.includes("expense"));

  const [incomeAgg, expenseAgg] = await Promise.all([
    includesIncome
      ? prisma.transaction.aggregate({
          where: { ...where, type: "income" },
          _sum: { amountInPreferredCurrency: true }
        })
      : null,
    includesExpense
      ? prisma.transaction.aggregate({
          where: { ...where, type: "expense" },
          _sum: { amountInPreferredCurrency: true }
        })
      : null
  ]);
  const income = incomeAgg?._sum.amountInPreferredCurrency?.toNumber() ?? 0;
  const expenses = expenseAgg?._sum.amountInPreferredCurrency?.toNumber() ?? 0;

  return { income, expenses, balance: income - expenses };
}

export async function getTransactionById(userId: string, id: string) {
  const transaction = await prisma.transaction.findFirst({
    where: { id, userId },
    include: {
      account: true,
      transferToAccount: true,
      category: true,
      expenseOffsetCategory: true,
      group: true,
      relations: { include: { relatedTransaction: true } },
      relatedBy: { include: { transaction: true } },
      sharedExpense: { include: { participants: true } }
    }
  });

  if (!transaction) throw notFound("Transaction");
  return transaction;
}

export async function listImportedTransactions(
  userId: string,
  filters: ImportedTransactionFilters
) {
  const where = importedTransactionWhere(userId, filters);
  const [importedTransactions, total, pendingCount] = await Promise.all([
    prisma.providerImportedTransaction.findMany({
      where,
      include: importedTransactionInclude,
      orderBy: importedTransactionOrderBy(filters)
    }),
    prisma.providerImportedTransaction.count({ where }),
    prisma.providerImportedTransaction.count({
      where: { userId, status: "pending" }
    })
  ]);

  return { importedTransactions, total, pendingCount };
}

export async function getImportedTransactionsPendingCount(userId: string) {
  return prisma.providerImportedTransaction.count({
    where: { userId, status: "pending" }
  });
}
