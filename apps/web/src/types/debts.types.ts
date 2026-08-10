import type { SettlementStatus } from "@flowledger/shared";
import type { SharedExpense, SharedExpenseParticipant } from "./sharedExpenses.types";
import type { PublicUser } from "./users.types";

/** Settlement request record shape. */
export type SettlementRequest = {
  id: string;
  sharedExpenseParticipantId: string;
  debtorUserId: string;
  creditorUserId: string;
  amount: number;
  status: SettlementStatus;
  note?: string | null;
  paymentInfo?: string | null;
  debtorAccountId?: string | null;
  debtorCategoryId?: string | null;
  creditorAccountId?: string | null;
  creditorCategoryId?: string | null;
  debtorTransactionId?: string | null;
  creditorTransactionId?: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string | null;
  debtor?: PublicUser;
  creditor?: PublicUser;
  sharedExpenseParticipant?: Debt;
};

/** A shared-expense participant's debt, with server-computed outstanding/pending amounts. */
export type Debt = SharedExpenseParticipant & {
  sharedExpenseId: string;
  debtorUserId?: string | null;
  creditorUserId?: string | null;
  outstandingAmount: number;
  outstandingAmountInPreferredCurrency?: number;
  pendingSettlementAmount: number;
  sharedExpense: SharedExpense & {
    owner?: PublicUser;
  };
  user?: PublicUser | null;
  settlementRequests: SettlementRequest[];
};

/** Aggregated per-person balance across all shared debts with that person. */
export type PersonBalance = {
  key: string;
  person: PublicUser | null;
  fallbackName: string;
  theyOweMe: Debt[];
  iOweThem: Debt[];
  theyOweMeTotal: number;
  iOweThemTotal: number;
  netBalance: number;
};

/** Server-computed debts/balances/settlement-request payload returned by `listDebts`. */
export type DebtsResponse = {
  iOwe: Debt[];
  owedToMe: Debt[];
  balances: PersonBalance[];
  pendingSettlementRequests: SettlementRequest[];
  approvedSettlementRequests: SettlementRequest[];
  settledDebts: Debt[];
};
