import { useMutation, useQueryClient } from "@tanstack/react-query";
import { acceptSharedExpense, rejectSharedExpense } from "../../../services/sharedExpenses.client";
import { blockUser } from "../../../services/users.client";

const INVALIDATED = ["debts", "notifications", "shared-expenses", "blocks"];

/** The three ways a participant answers a proposed share. */
export type ShareResponse =
  | { kind: "accept"; sharedExpenseId: string; participantId?: string }
  | { kind: "reject"; sharedExpenseId: string; participantId?: string }
  | { kind: "rejectAndBlock"; sharedExpenseId: string; ownerUserId: string; participantId?: string };

/**
 * Answers a proposed share (one allocation line when `participantId` is set, else all the caller's proposed lines): accept, reject, or reject and then block the owner. The reject runs
 * first because blocking would reject the share itself and make a second reject fail. Every
 * answer refetches debts, notifications, shared expenses and the block list. `respond` resolves
 * once the answer is stored; a failure leaves `error` set and the list unchanged.
 */
export function useShareResponse() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (response: ShareResponse) => {
      if (response.kind === "accept") await acceptSharedExpense(response.sharedExpenseId, response.participantId);
      else {
        await rejectSharedExpense(response.sharedExpenseId, response.participantId);
        if (response.kind === "rejectAndBlock") await blockUser(response.ownerUserId);
      }
    },
    onSettled: () =>
      Promise.all(INVALIDATED.map((key) => queryClient.invalidateQueries({ queryKey: [key] })))
  });

  return {
    respond: (response: ShareResponse) => mutation.mutateAsync(response).catch(() => undefined),
    isPending: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null
  };
}
