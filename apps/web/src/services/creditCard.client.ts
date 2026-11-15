import type { CreditCardBilling } from "@flowledger/shared";
import { apiRequest } from "./api.client";

/** Fetches one page (12 periods, newest first) of a credit card's billing figures. */
export function getCreditCardBilling(accountId: string, page = 1) {
  return apiRequest<CreditCardBilling>(`/accounts/${accountId}/credit-card`, {
    query: { page: String(page) }
  });
}
