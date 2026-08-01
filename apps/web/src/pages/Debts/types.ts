export type SettlementDraft = {
  amount: string;
  accountId: string;
  categoryId: string;
  note: string;
  paymentInfo: string;
};

export type { SettlementApprovalDraft } from "./components/ApprovalActions";
