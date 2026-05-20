import { Router } from "express";
import { prisma } from "../../db/prisma.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { serialize } from "../../utils/serialize.js";

export const reportsRouter = Router();

reportsRouter.get(
  "/summary",
  asyncHandler(async (req, res) => {
    const [income, expenses] = await Promise.all([
      prisma.transaction.aggregate({
        where: { userId: req.user!.id, type: "income" },
        _sum: { amount: true }
      }),
      prisma.transaction.aggregate({
        where: { userId: req.user!.id, type: "expense" },
        _sum: { amount: true }
      })
    ]);

    const totalIncome = income._sum.amount?.toNumber() ?? 0;
    const totalExpenses = expenses._sum.amount?.toNumber() ?? 0;

    res.json({
      summary: {
        totalIncome,
        totalExpenses,
        currentBalance: totalIncome - totalExpenses
      }
    });
  })
);

reportsRouter.get(
  "/by-category",
  asyncHandler(async (req, res) => {
    const rows = await prisma.transaction.groupBy({
      by: ["categoryId", "type"],
      where: { userId: req.user!.id },
      _sum: { amount: true }
    });

    const categories = await prisma.category.findMany({ where: { userId: req.user!.id } });
    const categoryById = new Map(categories.map((category) => [category.id, category]));

    res.json({
      categories: rows.map((row) => ({
        categoryId: row.categoryId,
        categoryName: row.categoryId ? categoryById.get(row.categoryId)?.name ?? "Uncategorized" : "Uncategorized",
        type: row.type,
        total: row._sum.amount?.toNumber() ?? 0
      }))
    });
  })
);

reportsRouter.get(
  "/monthly-cashflow",
  asyncHandler(async (req, res) => {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user!.id, type: { in: ["income", "expense"] } },
      select: { date: true, type: true, amount: true },
      orderBy: { date: "asc" }
    });

    const monthly = new Map<string, { month: string; income: number; expenses: number; balance: number }>();

    for (const transaction of transactions) {
      const month = transaction.date.toISOString().slice(0, 7);
      const row = monthly.get(month) ?? { month, income: 0, expenses: 0, balance: 0 };
      const amount = transaction.amount.toNumber();

      if (transaction.type === "income") row.income += amount;
      if (transaction.type === "expense") row.expenses += amount;
      row.balance = row.income - row.expenses;
      monthly.set(month, row);
    }

    res.json({ cashflow: serialize([...monthly.values()]) });
  })
);
