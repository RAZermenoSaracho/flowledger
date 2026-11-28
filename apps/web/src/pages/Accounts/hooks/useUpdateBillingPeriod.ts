import type { UpdateBillingPeriodInput } from "@flowledger/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateBillingPeriod } from "../../../services/creditCard.client";

/**
 * Mutation that sets or resets the closing and/or due date of one billing period of a credit card. On success every cached
 * billing page of the card is refetched, since an override moves the next period's start and the previous period's window.
 */
export function useUpdateBillingPeriod(accountId: string, periodKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateBillingPeriodInput) => updateBillingPeriod(accountId, periodKey, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["accounts", "credit-card", accountId] })
  });
}
