import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getCreditCardBilling } from "../../../services/creditCard.client";

/** Loads one page of a credit card's billing data; the previous page stays visible while the next loads. Disabled without an `accountId`. */
export function useCreditCard(accountId: string, page: number) {
  return useQuery({
    queryKey: ["accounts", "credit-card", accountId, page],
    enabled: Boolean(accountId),
    placeholderData: keepPreviousData,
    queryFn: () => getCreditCardBilling(accountId, page)
  });
}
