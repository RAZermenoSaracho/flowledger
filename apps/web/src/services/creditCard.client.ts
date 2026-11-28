import type {
  BillingPeriod,
  CreditCardBilling,
  UpdateBillingPeriodInput
} from "@flowledger/shared";
import { apiRequest } from "./api.client";

/** Fetches one page (12 periods, newest first) of a credit card's billing figures. */
export function getCreditCardBilling(accountId: string, page = 1) {
  return apiRequest<CreditCardBilling>(`/accounts/${accountId}/credit-card`, {
    query: { page: String(page) }
  });
}

/** Sets or resets (`null`) the closing and/or due date of one billing period; `key` is the period's `YYYY-MM`. Returns the recomputed period. */
export function updateBillingPeriod(
  accountId: string,
  key: string,
  body: UpdateBillingPeriodInput
) {
  return apiRequest<BillingPeriod>(
    `/accounts/${accountId}/credit-card/periods/${key}`,
    {
      method: "PATCH",
      body
    }
  );
}
