import { SETTLEMENT_STATUSES } from "@flowledger/shared";
import type { SearchFieldConfig } from "../../../utils/searchDomain";
import type { Debt, PersonBalance, SettlementRequest } from "../../../types/debts.types";
import { debtDescription, debtTitle, displayPerson, statusLabel } from "./debtDisplay";

/**
 * Balances/pending-requests/settled-debts come back as one already-fetched,
 * server-computed payload with no query params of its own (see
 * `debts.client.ts`'s `listDebts`) — there's no backend DSQL query to
 * forward a `<SearchBar>` condition tree to. Each `*SearchRow` type below is
 * a flat, plain-object view of the derived fields a tab's rows are actually
 * searchable/filterable by; `searchDomain.ts`'s `matchesWhere` evaluates the
 * compiled `where` tree against these directly, client-side.
 */

/** Flat, plain-object view of a `PersonBalance`'s searchable/filterable fields — see file header. */
export type BalanceSearchRow = {
  personName: string;
  personEmail: string;
  recordTitles: string;
  netBalance: number;
  theyOweMeTotal: number;
  iOweThemTotal: number;
};

/** Flattens a `PersonBalance` into the plain fields `balanceSearchFields` filters on. */
export function toBalanceSearchRow(balance: PersonBalance): BalanceSearchRow {
  return {
    personName: displayPerson(balance),
    personEmail: balance.person?.email ?? "",
    recordTitles: [...balance.theyOweMe, ...balance.iOweThem]
      .map((debt) => debtTitle(debt))
      .join(" "),
    netBalance: balance.netBalance,
    theyOweMeTotal: balance.theyOweMeTotal,
    iOweThemTotal: balance.iOweThemTotal
  };
}

/** `<SearchBar>` field config for the Outstanding Balances tab, evaluated client-side against {@link BalanceSearchRow}. */
export const balanceSearchFields: SearchFieldConfig[] = [
  {
    name: "search",
    label: "Search",
    type: "string",
    expandsToFields: ["personName", "personEmail", "recordTitles"]
  },
  { name: "netBalance", label: "Net balance", type: "number" },
  { name: "theyOweMeTotal", label: "They owe me", type: "number" },
  { name: "iOweThemTotal", label: "I owe them", type: "number" }
];

/** Field the Outstanding Balances tab's quick-search box targets. */
export const BALANCE_DEFAULT_SEARCH_FIELD = "search";

/** Flat, plain-object view of a `SettlementRequest`'s searchable/filterable fields — see file header. */
export type SettlementRequestSearchRow = {
  debtTitle: string;
  transactionName: string;
  debtorName: string;
  debtorEmail: string;
  creditorName: string;
  creditorEmail: string;
  note: string;
  amount: number;
  status: string;
};

/** Flattens a `SettlementRequest` into the plain fields `settlementRequestSearchFields` filters on. */
export function toSettlementRequestSearchRow(
  request: SettlementRequest
): SettlementRequestSearchRow {
  const debt = request.sharedExpenseParticipant;
  return {
    debtTitle: debt?.sharedExpense.title ?? "",
    transactionName: debt?.sharedExpense.transaction?.name ?? "",
    debtorName: request.debtor?.name ?? "",
    debtorEmail: request.debtor?.email ?? "",
    creditorName: request.creditor?.name ?? "",
    creditorEmail: request.creditor?.email ?? "",
    note: request.note ?? "",
    amount: request.amount,
    status: request.status
  };
}

/** `<SearchBar>` field config for the Pending Settlement Requests tab, evaluated client-side against {@link SettlementRequestSearchRow}. */
export const settlementRequestSearchFields: SearchFieldConfig[] = [
  {
    name: "search",
    label: "Search",
    type: "string",
    expandsToFields: [
      "debtTitle",
      "transactionName",
      "debtorName",
      "debtorEmail",
      "creditorName",
      "creditorEmail",
      "note"
    ]
  },
  { name: "amount", label: "Amount", type: "number" },
  {
    name: "status",
    label: "Status",
    type: "enum",
    options: SETTLEMENT_STATUSES.map((status) => ({
      label: status,
      value: status
    }))
  }
];

/** Field the Pending Settlement Requests tab's quick-search box targets. */
export const SETTLEMENT_REQUEST_DEFAULT_SEARCH_FIELD = "search";

/** Flat, plain-object view of a settled `Debt`'s searchable/filterable fields — see file header. */
export type SettledDebtSearchRow = {
  title: string;
  description: string;
  status: string;
  participantName: string;
  userName: string;
  userEmail: string;
  ownerName: string;
  ownerEmail: string;
  transactionName: string;
  shareAmount: number;
  paidAmount: number;
  outstandingAmount: number;
};

/** Flattens a settled `Debt` into the plain fields `settledDebtSearchFields` filters on. */
export function toSettledDebtSearchRow(
  debt: Debt,
  viewerUserId?: string
): SettledDebtSearchRow {
  return {
    title: debtTitle(debt),
    description: debtDescription(debt, viewerUserId),
    status: statusLabel(debt),
    participantName: debt.participantName ?? "",
    userName: debt.user?.name ?? "",
    userEmail: debt.user?.email ?? "",
    ownerName: debt.sharedExpense.owner?.name ?? "",
    ownerEmail: debt.sharedExpense.owner?.email ?? "",
    transactionName: debt.sharedExpense.transaction?.name ?? "",
    shareAmount: debt.shareAmount,
    paidAmount: debt.paidAmount,
    outstandingAmount: debt.outstandingAmount
  };
}

/** `<SearchBar>` field config for the Settled History tab, evaluated client-side against {@link SettledDebtSearchRow}. */
export const settledDebtSearchFields: SearchFieldConfig[] = [
  {
    name: "search",
    label: "Search",
    type: "string",
    expandsToFields: [
      "title",
      "description",
      "status",
      "participantName",
      "userName",
      "userEmail",
      "ownerName",
      "ownerEmail",
      "transactionName"
    ]
  },
  { name: "shareAmount", label: "Share amount", type: "number" },
  { name: "paidAmount", label: "Paid amount", type: "number" },
  { name: "outstandingAmount", label: "Outstanding amount", type: "number" }
];

/** Field the Settled History tab's quick-search box targets. */
export const SETTLED_DEBT_DEFAULT_SEARCH_FIELD = "search";
