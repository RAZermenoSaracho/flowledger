import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { serialize } from "../../utils/serialize.js";

export const reportsRouter = Router();

reportsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const [income, netIncome, expenses, expenseReimbursements] =
      await Promise.all([
        prisma.transaction.aggregate({
          where: {
            userId: req.user!.id,
            type: "income"
          },
          _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
          where: {
            userId: req.user!.id,
            type: "income",
            expenseOffsetCategoryId: null
          },
          _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
          where: { userId: req.user!.id, type: "expense" },
          _sum: { amount: true }
        }),
        prisma.transaction.aggregate({
          where: {
            userId: req.user!.id,
            type: "income",
            expenseOffsetCategoryId: { not: null }
          },
          _sum: { amount: true }
        })
      ]);

    const totalGrossIncome = income._sum.amount?.toNumber() ?? 0;
    const totalNetIncome = netIncome._sum.amount?.toNumber() ?? 0;
    const totalGrossExpenses = expenses._sum.amount?.toNumber() ?? 0;
    const totalExpenseReimbursements =
      expenseReimbursements._sum.amount?.toNumber() ?? 0;
    const totalNetExpenses = totalGrossExpenses - totalExpenseReimbursements;

    res.json({
      summary: {
        totalIncome: totalNetIncome,
        totalGrossIncome,
        totalNetIncome,
        totalExpenses: totalNetExpenses,
        totalGrossExpenses,
        totalExpenseReimbursements,
        totalNetExpenses,
        currentBalance: totalGrossIncome - totalGrossExpenses
      }
    });
  })
);

reportsRouter.get(
  "/by-category",
  asyncHandler(async (req, res) => {
    const [rows, expenseReimbursementRows, incomeOffsetRows] =
      await Promise.all([
        prisma.transaction.groupBy({
          by: ["categoryId", "type"],
          where: {
            userId: req.user!.id,
            type: { in: ["income", "expense"] }
          },
          _sum: { amount: true }
        }),
        prisma.transaction.groupBy({
          by: ["expenseOffsetCategoryId"],
          where: {
            userId: req.user!.id,
            type: "income",
            expenseOffsetCategoryId: { not: null }
          },
          _sum: { amount: true }
        }),
        prisma.transaction.groupBy({
          by: ["categoryId"],
          where: {
            userId: req.user!.id,
            type: "income",
            expenseOffsetCategoryId: { not: null }
          },
          _sum: { amount: true }
        })
      ]);

    const categories = await prisma.category.findMany({
      where: { users: { some: { userId: req.user!.id } } }
    });
    const categoryById = new Map(
      categories.map((category) => [category.id, category])
    );
    const reimbursementsByCategoryId = new Map(
      expenseReimbursementRows.map((row) => [
        row.expenseOffsetCategoryId,
        row._sum.amount?.toNumber() ?? 0
      ])
    );
    const incomeOffsetsByCategoryId = new Map(
      incomeOffsetRows.map((row) => [
        row.categoryId,
        row._sum.amount?.toNumber() ?? 0
      ])
    );
    const rowKeys = new Set(
      rows.map((row) => `${row.type}:${row.categoryId ?? "uncategorized"}`)
    );
    const reimbursementOnlyRows = expenseReimbursementRows
      .filter(
        (row) =>
          row.expenseOffsetCategoryId &&
          !rowKeys.has(`expense:${row.expenseOffsetCategoryId}`)
      )
      .map((row) => ({
        categoryId: row.expenseOffsetCategoryId,
        type: "expense" as const,
        _sum: { amount: null }
      }));

    res.json({
      categories: [...rows, ...reimbursementOnlyRows]
        .map((row) => {
          const category = row.categoryId
            ? categoryById.get(row.categoryId)
            : null;
          const total = row._sum.amount?.toNumber() ?? 0;
          const reimbursementTotal =
            row.type === "expense" && row.categoryId
              ? (reimbursementsByCategoryId.get(row.categoryId) ?? 0)
              : 0;
          const incomeOffsetTotal =
            row.type === "income"
              ? (incomeOffsetsByCategoryId.get(row.categoryId) ?? 0)
              : 0;
          const grossIncomeTotal = row.type === "income" ? total : 0;
          const netIncomeTotal =
            row.type === "income" ? total - incomeOffsetTotal : 0;

          return {
            categoryId: row.categoryId,
            categoryName: category?.name ?? "Uncategorized",
            categoryType: category?.type ?? null,
            categoryColor: category?.color ?? null,
            type: row.type,
            total:
              row.type === "expense"
                ? total - reimbursementTotal
                : netIncomeTotal,
            grossIncomeTotal,
            incomeOffsetTotal,
            netIncomeTotal,
            grossExpenseTotal: row.type === "expense" ? total : 0,
            reimbursementTotal,
            netExpenseTotal:
              row.type === "expense" ? total - reimbursementTotal : 0
          };
        })
        .sort((a, b) => b.total - a.total)
    });
  })
);

reportsRouter.get(
  "/monthly-cashflow",
  asyncHandler(async (req, res) => {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user!.id, type: { in: ["income", "expense"] } },
      select: {
        date: true,
        type: true,
        amount: true,
        expenseOffsetCategoryId: true
      },
      orderBy: { date: "asc" }
    });

    const monthly = new Map<
      string,
      {
        month: string;
        income: number;
        expenses: number;
        grossExpenses: number;
        expenseReimbursements: number;
        netExpenses: number;
        grossIncome: number;
        incomeOffsets: number;
        netIncome: number;
        balance: number;
      }
    >();

    for (const transaction of transactions) {
      const month = transaction.date.toISOString().slice(0, 7);
      const row = monthly.get(month) ?? {
        month,
        income: 0,
        expenses: 0,
        grossExpenses: 0,
        expenseReimbursements: 0,
        netExpenses: 0,
        grossIncome: 0,
        incomeOffsets: 0,
        netIncome: 0,
        balance: 0
      };
      const amount = transaction.amount.toNumber();

      if (transaction.type === "income") {
        row.income += amount;
        row.grossIncome += amount;
      }
      if (
        transaction.type === "income" &&
        transaction.expenseOffsetCategoryId
      ) {
        row.expenseReimbursements += amount;
        row.incomeOffsets += amount;
      }
      if (transaction.type === "expense") {
        row.expenses += amount;
        row.grossExpenses += amount;
      }
      row.netExpenses = row.grossExpenses - row.expenseReimbursements;
      row.netIncome = row.grossIncome - row.incomeOffsets;
      row.balance = row.income - row.expenses;
      monthly.set(month, row);
    }

    res.json({ cashflow: serialize([...monthly.values()]) });
  })
);
