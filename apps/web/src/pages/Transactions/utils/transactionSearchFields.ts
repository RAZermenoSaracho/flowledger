import { TRANSACTION_TYPES } from "@flowledger/shared";
import type {
  GroupableField,
  SearchFieldConfig,
  SortableField
} from "../../../utils/searchDomain";

// Every scalar field on the Prisma Transaction model (database/prisma/schema.prisma),
// plus two virtual fields ("classification", "transactionFilterType") that
// aren't real columns — apps/api's transactions read.service.ts recognizes
// them by name wherever they appear in the `where` tree and expands them
// into the real condition they mean. Deliberately exhaustive: every field
// is included, even ones that may not be useful to filter by day to day
// (id, userId, exchangeRate, ...) — trim what you don't want exposed
// rather than the config pre-deciding for you.
export function buildTransactionSearchFields(options: {
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  groups: { id: string; name: string }[];
  currencyOptions: string[];
}): SearchFieldConfig[] {
  const accountOptions = options.accounts.map((account) => ({
    label: account.name,
    value: account.id
  }));
  const categoryOptions = options.categories.map((category) => ({
    label: category.name,
    value: category.id
  }));

  return [
    { name: "id", label: "ID", type: "string" },
    { name: "userId", label: "User ID", type: "string" },
    { name: "name", label: "Name", type: "string" },
    { name: "notes", label: "Notes", type: "string" },
    { name: "amount", label: "Amount", type: "number" },
    { name: "amountInPreferredCurrency", label: "Amount (preferred currency)", type: "number" },
    { name: "exchangeRate", label: "Exchange rate", type: "number" },
    {
      name: "executionCurrency",
      label: "Currency",
      type: "enum",
      options: options.currencyOptions.map((currency) => ({ label: currency, value: currency }))
    },
    {
      name: "type",
      label: "Type",
      type: "enum",
      options: TRANSACTION_TYPES.map((type) => ({ label: type, value: type }))
    },
    { name: "date", label: "Date", type: "date" },
    { name: "createdAt", label: "Created at", type: "date" },
    { name: "updatedAt", label: "Updated at", type: "date" },
    { name: "accountId", label: "Account", type: "enum", options: accountOptions },
    {
      name: "transferToAccountId",
      label: "Transfer to account",
      type: "enum",
      options: accountOptions
    },
    { name: "categoryId", label: "Category", type: "enum", options: categoryOptions },
    {
      name: "expenseOffsetCategoryId",
      label: "Expense offset category",
      type: "enum",
      options: categoryOptions
    },
    { name: "groupId", label: "Group", type: "enum", options: options.groups.map((group) => ({ label: group.name, value: group.id })) },
    {
      // Not a real Transaction column — see file header.
      name: "classification",
      label: "Classification",
      type: "enum",
      options: [
        { label: "Complete", value: "complete" },
        { label: "Needs classification", value: "needsClassification" }
      ]
    },
    {
      // Not a real Transaction column either — see file header. Settlement/
      // normal detection needs an extra lookup the backend resolves once
      // per request no matter where in the tree this condition sits.
      name: "transactionFilterType",
      label: "Transaction group",
      type: "enum",
      options: [
        { label: "Normal transactions", value: "normal" },
        { label: "Settlement transactions", value: "settlement" },
        { label: "Expense reimbursement/offset transactions", value: "expenseOffset" }
      ]
    }
  ];
}

export const TRANSACTION_GROUPABLE_FIELDS: GroupableField[] = [
  { name: "category", label: "Category" },
  { name: "account", label: "Account" },
  { name: "month", label: "Month" }
];

export const TRANSACTION_SORTABLE_FIELDS: SortableField[] = [
  { name: "date", label: "Date" },
  { name: "name", label: "Name" },
  { name: "amount", label: "Amount" },
  { name: "createdAt", label: "Created date" }
];

export const TRANSACTION_DEFAULT_SEARCH_FIELD = "name";
