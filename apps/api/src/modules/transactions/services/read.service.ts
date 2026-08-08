import type { Prisma } from "@prisma/client";
import {
  classificationSchema,
  transactionFilterTypeSchema,
  type Classification,
  type TransactionFilterType
} from "@flowledger/shared";
import type { WhereInput } from "datasieve";
import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import type { RawWhereNode } from "../../../db/sieve.types.js";
import { badRequest, notFound } from "../../../utils/httpError.js";
import type {
  ImportedTransactionFilters,
  TransactionRecord,
  TransactionsQueryInput
} from "../types/transactions.types.js";
import {
  importedTransactionInclude,
  importedTransactionOrderBy,
  importedTransactionWhere
} from "../utils/importedTransactionQuery.js";

const transactionsSieve = createSieve(prisma.transaction);

// The one facet DSQL can't express yet: "does this transaction have a
// related-transaction row of type settlement_payment" needs a to-many
// relation filtered by a nested condition, which DSQL has no quantifier
// for (see @razsdev/datasieve-prisma's README "known limitations"). This
// stays a narrow, unexported raw-Prisma precompute confined to this
// service — its result (a plain transaction-id list) is folded back into
// the DSQL `where` tree as an ordinary `id in/notIn` condition, so the
// actual query execution still flows entirely through datasieve.
const settlementTransactionWhere: Prisma.TransactionWhereInput = {
  OR: [
    { debtorSettlementRequest: { isNot: null } },
    { creditorSettlementRequest: { isNot: null } },
    { relations: { some: { relationType: "settlement_payment" } } },
    { relatedBy: { some: { relationType: "settlement_payment" } } }
  ]
};

async function getSettlementTransactionIds(userId: string) {
  const rows = await prisma.transaction.findMany({
    where: { userId, ...settlementTransactionWhere },
    select: { id: true }
  });
  return rows.map((row) => row.id);
}

// Settlement-transaction ids are looked up at most once per request,
// even if `transactionFilterType` appears more than once in the tree
// (e.g. `settlement` nested in one branch, `normal` in another).
type SettlementIdsCache = { promise?: Promise<string[]> };

function getCachedSettlementTransactionIds(userId: string, cache: SettlementIdsCache) {
  cache.promise ??= getSettlementTransactionIds(userId);
  return cache.promise;
}

async function transactionFilterTypeCondition(
  userId: string,
  transactionFilterType: TransactionFilterType,
  cache: SettlementIdsCache
): Promise<WhereInput<TransactionRecord>> {
  if (transactionFilterType === "expenseOffset") {
    return { field: "expenseOffsetCategoryId", op: "isNotNull" };
  }

  if (transactionFilterType === "settlement") {
    const ids = await getCachedSettlementTransactionIds(userId, cache);
    return { field: "id", op: "in", value: ids };
  }

  const ids = await getCachedSettlementTransactionIds(userId, cache);
  return {
    and: [
      { field: "id", op: "notIn", value: ids },
      { field: "expenseOffsetCategoryId", op: "isNull" }
    ]
  };
}

function classificationCondition(
  classification: Classification
): WhereInput<TransactionRecord> {
  if (classification === "needsClassification") {
    return {
      or: [
        {
          and: [
            { field: "type", op: "=", value: "transfer" },
            {
              or: [
                { field: "accountId", op: "isNull" },
                { field: "transferToAccountId", op: "isNull" }
              ]
            }
          ]
        },
        {
          and: [
            { field: "type", op: "!=", value: "transfer" },
            {
              or: [
                { field: "accountId", op: "isNull" },
                { field: "categoryId", op: "isNull" }
              ]
            }
          ]
        }
      ]
    };
  }

  return {
    or: [
      {
        and: [
          { field: "type", op: "=", value: "transfer" },
          { field: "accountId", op: "isNotNull" },
          { field: "transferToAccountId", op: "isNotNull" }
        ]
      },
      {
        and: [
          { field: "type", op: "!=", value: "transfer" },
          { field: "accountId", op: "isNotNull" },
          { field: "categoryId", op: "isNotNull" }
        ]
      }
    ]
  };
}

// `where` arrives as a RawWhereNode — a DSQL-shaped tree that may contain
// leaf conditions on two virtual field names ("classification",
// "transactionFilterType") which aren't real Transaction columns. Rather
// than treating those as a separate top-level extension (which would
// only ever apply as a whole-query AND, unable to sit inside an OR or a
// nested AND the way the frontend's domain builder lets a user place any
// other condition), this walks the tree and rewrites each such leaf,
// in place, into the real WhereInput<TransactionRecord> fragment it
// means — preserving exactly where the user put it in the and/or nesting.
// Every other leaf condition passes through untouched, trusted to
// datasieve's own parse/validate pipeline the same as before.
async function expandVirtualConditions(
  node: RawWhereNode | undefined,
  userId: string,
  cache: SettlementIdsCache
): Promise<WhereInput<TransactionRecord> | undefined> {
  if (!node) return undefined;

  if ("and" in node) {
    const children = await Promise.all(
      node.and.map((child) => expandVirtualConditions(child, userId, cache))
    );
    return { and: children.filter((child) => child !== undefined) };
  }

  if ("or" in node) {
    const children = await Promise.all(
      node.or.map((child) => expandVirtualConditions(child, userId, cache))
    );
    return { or: children.filter((child) => child !== undefined) };
  }

  if ("not" in node) {
    const inner = await expandVirtualConditions(node.not, userId, cache);
    return inner ? { not: inner } : undefined;
  }

  if (node.field === "classification") {
    return classificationCondition(classificationSchema.parse(node.value));
  }

  if (node.field === "transactionFilterType") {
    return transactionFilterTypeCondition(
      userId,
      transactionFilterTypeSchema.parse(node.value),
      cache
    );
  }

  return node as WhereInput<TransactionRecord>;
}

function parseTransactionsQueryParam(raw: string | undefined) {
  if (!raw) return {} as TransactionsQueryInput;

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw badRequest("Invalid transactions query: not valid JSON");
  }

  if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
    throw badRequest("Invalid transactions query: must be a JSON object");
  }

  return decoded as TransactionsQueryInput;
}

async function buildTransactionsWhere(
  userId: string,
  input: TransactionsQueryInput
): Promise<WhereInput<TransactionRecord>> {
  const cache: SettlementIdsCache = {};
  const expandedWhere = await expandVirtualConditions(input.where, userId, cache);
  const userCondition: WhereInput<TransactionRecord> = {
    field: "userId",
    op: "=",
    value: userId
  };

  return expandedWhere ? { and: [userCondition, expandedWhere] } : userCondition;
}

const transactionInclude = {
  account: true,
  transferToAccount: true,
  category: true,
  expenseOffsetCategory: true,
  group: true
} as const;

export async function listTransactions(userId: string, rawQuery: string | undefined) {
  const input = parseTransactionsQueryParam(rawQuery);
  const where = await buildTransactionsWhere(userId, input);

  // No fallback for sort/pagination: an omission should reach datasieve
  // as an omission, not be forced into a FlowLedger-chosen default —
  // datasieve itself decides what "no sort"/"no pagination" means
  // (unordered/unpaginated). The frontend supplies its own sensible
  // defaults (e.g. date desc) when building the request.
  return transactionsSieve.query<TransactionRecord>({
    where,
    sort: input.sort,
    pagination: input.pagination,
    include: transactionInclude
  });
}

export async function getTransactionsSummary(
  userId: string,
  rawQuery: string | undefined
) {
  const input = parseTransactionsQueryParam(rawQuery);
  const where = await buildTransactionsWhere(userId, input);

  const result = await transactionsSieve.query<TransactionRecord>({
    where,
    groupBy: { fields: ["type"] },
    aggregations: [{ fn: "sum", field: "amountInPreferredCurrency", alias: "total" }]
  });

  // Not serialize(): it converts Prisma.Decimal via a JSON.stringify
  // replacer, but Decimal.js defines its own toJSON() (returning a
  // string), which JSON.stringify calls before the replacer ever sees
  // the value — so the replacer's `instanceof Prisma.Decimal` check
  // never fires here. Number() sidesteps that (Decimal.js supports
  // numeric coercion via toString()), giving a real number instead of a
  // numeric string sneaking into a `number`-typed response field.
  const rows = result.data as unknown as {
    type: "income" | "expense" | "transfer";
    total: unknown;
  }[];
  const income = Number(rows.find((row) => row.type === "income")?.total ?? 0);
  const expenses = Number(
    rows.find((row) => row.type === "expense")?.total ?? 0
  );

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
