export const publicTransactionSelect = {
  id: true,
  name: true,
  amount: true,
  type: true,
  date: true,
  categoryId: true,
  expenseOffsetCategoryId: true,
  groupId: true
};

export const debtInclude = {
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
