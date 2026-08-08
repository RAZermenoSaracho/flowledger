import { Prisma } from "@prisma/client";
import { HttpError } from "../../../utils/httpError.js";
import type {
  ImportedTransactionFilters,
  ImportedTransactionSelection
} from "../types/transactions.types.js";

export const importedTransactionInclude = {
  providerAccount: {
    include: {
      account: true,
      connection: {
        select: {
          id: true,
          institutionId: true,
          institutionName: true,
          status: true,
          lastSyncAt: true
        }
      }
    }
  },
  category: true,
  transaction: true
} satisfies Prisma.ProviderImportedTransactionInclude;

export function importedTransactionWhere(
  userId: string,
  filters: ImportedTransactionFilters = {}
) {
  const andFilters: Prisma.ProviderImportedTransactionWhereInput[] = [];
  const search = filters.search?.trim();

  if (filters.accountId) {
    andFilters.push({
      providerAccount: { accountId: filters.accountId }
    });
  }

  if (filters.providerAccountId) {
    andFilters.push({
      OR: [
        { providerAccountRefId: filters.providerAccountId },
        { providerAccountId: filters.providerAccountId }
      ]
    });
  }

  if (search) {
    const searchFilters: Prisma.ProviderImportedTransactionWhereInput[] = [
      { description: { contains: search, mode: "insensitive" } },
      { provider: { contains: search, mode: "insensitive" } },
      {
        providerCredentialId: { contains: search, mode: "insensitive" }
      },
      {
        providerAccountId: { contains: search, mode: "insensitive" }
      },
      {
        providerTransactionId: { contains: search, mode: "insensitive" }
      },
      {
        category: { name: { contains: search, mode: "insensitive" } }
      },
      {
        providerAccount: {
          providerAccountId: { contains: search, mode: "insensitive" }
        }
      },
      {
        providerAccount: {
          account: {
            name: { contains: search, mode: "insensitive" }
          }
        }
      },
      {
        providerAccount: {
          connection: {
            institutionName: {
              contains: search,
              mode: "insensitive"
            }
          }
        }
      },
      {
        providerAccount: {
          connection: {
            institutionId: {
              contains: search,
              mode: "insensitive"
            }
          }
        }
      },
      {
        providerAccount: {
          accountMetadata: {
            path: ["name"],
            string_contains: search,
            mode: "insensitive"
          }
        }
      },
      {
        providerAccount: {
          accountMetadata: {
            path: ["type"],
            string_contains: search,
            mode: "insensitive"
          }
        }
      },
      {
        providerAccount: {
          accountMetadata: {
            path: ["currency"],
            string_contains: search,
            mode: "insensitive"
          }
        }
      }
    ];

    try {
      const amount = new Prisma.Decimal(search);
      if (!amount.isNaN()) {
        searchFilters.push({ amount });
      }
    } catch {
      // Non-numeric search terms should still match text and date fields.
    }

    const dateSearch = /^\d{4}-\d{2}-\d{2}/.test(search)
      ? new Date(search)
      : null;
    if (dateSearch && !Number.isNaN(dateSearch.getTime())) {
      const nextDay = new Date(dateSearch);
      nextDay.setDate(nextDay.getDate() + 1);
      searchFilters.push({
        transactionDate: {
          gte: dateSearch,
          lt: nextDay
        }
      });
    }

    andFilters.push({
      OR: searchFilters
    });
  }

  const transactionDateFilter =
    filters.dateFrom || filters.dateTo
      ? {
          ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
          ...(filters.dateTo
            ? {
                lte: (() => {
                  const endDate = new Date(filters.dateTo!);
                  endDate.setHours(23, 59, 59, 999);
                  return endDate;
                })()
              }
            : {})
        }
      : undefined;

  return {
    userId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.provider ? { provider: filters.provider } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.amountFrom !== undefined || filters.amountTo !== undefined
      ? {
          amount: {
            ...(filters.amountFrom !== undefined
              ? { gte: filters.amountFrom }
              : {}),
            ...(filters.amountTo !== undefined ? { lte: filters.amountTo } : {})
          }
        }
      : {}),
    ...(transactionDateFilter ? { transactionDate: transactionDateFilter } : {}),
    ...(andFilters.length > 0 ? { AND: andFilters } : {})
  } satisfies Prisma.ProviderImportedTransactionWhereInput;
}

export function importedTransactionOrderBy(filters: ImportedTransactionFilters) {
  return {
    [filters.sortBy ?? "transactionDate"]: filters.sortDirection ?? "desc"
  } satisfies Prisma.ProviderImportedTransactionOrderByWithRelationInput;
}

export function importedTransactionSelectionWhere(
  userId: string,
  selection: ImportedTransactionSelection
) {
  if (selection.mode === "ids") {
    return {
      userId,
      id: { in: Array.from(new Set(selection.ids)) }
    } satisfies Prisma.ProviderImportedTransactionWhereInput;
  }

  return importedTransactionWhere(userId, selection.filters ?? {});
}

export function importedTransactionType(amount: Prisma.Decimal) {
  if (amount.lessThan(0)) return "expense" as const;
  if (amount.greaterThan(0)) return "income" as const;
  throw new HttpError(
    400,
    "Imported transactions with a zero amount cannot be imported"
  );
}

export function importValidationError(id: string, message: string) {
  return { id, message };
}
