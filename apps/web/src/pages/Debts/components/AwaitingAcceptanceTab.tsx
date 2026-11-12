import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import type { Debt } from "../../../types/debts.types";
import { formatMoney } from "../../../utils/currency";
import { formatPublicUser } from "../../../utils/publicUser";
import { useShareResponse } from "../hooks/useShareResponse";
import { EmptyState } from "./EmptyState";
import { participantName } from "../utils/debtDisplay";

function InvitationRow({
  debt,
  viewerUserId,
  isHighlighted,
  disabled,
  respond
}: {
  debt: Debt;
  viewerUserId?: string;
  isHighlighted: boolean;
  disabled: boolean;
  respond: ReturnType<typeof useShareResponse>["respond"];
}) {
  const { sharedExpense } = debt;
  const ownerLabel = sharedExpense.owner ? formatPublicUser(sharedExpense.owner) : "the owner";
  const isMine = debt.userId === viewerUserId;
  const share = formatMoney(debt.shareAmount, debt.currency);

  return (
    <article
      id={`share-${sharedExpense.id}`}
      aria-label={sharedExpense.title}
      className={`grid min-w-0 gap-3 rounded-md border p-3 ${
        isHighlighted
          ? "border-pine ring-2 ring-pine/40"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      <div className="min-w-0 [overflow-wrap:anywhere]">
        <p className="font-semibold">{sharedExpense.title}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {isMine
            ? `${ownerLabel} asks you to cover ${share}`
            : `${participantName(debt)} owes you ${share}`}
        </p>
      </div>
      {isMine ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            disabled={disabled}
            onClick={() => respond({ kind: "accept", sharedExpenseId: sharedExpense.id, participantId: debt.id })}
          >
            Accept
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={disabled}
            onClick={() => respond({ kind: "reject", sharedExpenseId: sharedExpense.id, participantId: debt.id })}
          >
            Reject
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={disabled}
            onClick={() =>
              respond({
                kind: "rejectAndBlock",
                sharedExpenseId: sharedExpense.id,
                ownerUserId: sharedExpense.ownerUserId,
                participantId: debt.id
              })
            }
          >
            Reject and block
          </Button>
        </div>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">Waiting for their answer.</p>
      )}
    </article>
  );
}

/**
 * Debts tab listing shares not yet answered: a participant accepts, rejects or "rejects and
 * blocks" the owner (only the participant is offered buttons); an owner sees their own proposals as
 * waiting, plus the shares that were rejected. `highlightedSharedExpenseId` (from a notification)
 * marks one row, or says the invitation was not found once `isLoading` is false and no row matches.
 */
export function AwaitingAcceptanceTab({
  awaiting,
  rejected,
  viewerUserId,
  highlightedSharedExpenseId,
  isLoading
}: {
  awaiting: Debt[];
  rejected: Debt[];
  viewerUserId?: string;
  highlightedSharedExpenseId?: string | null;
  isLoading: boolean;
}) {
  const { respond, isPending, error } = useShareResponse();
  const notFound =
    Boolean(highlightedSharedExpenseId) &&
    !isLoading &&
    ![...awaiting, ...rejected].some((debt) => debt.sharedExpenseId === highlightedSharedExpenseId);

  return (
    <Card>
      <h2 className="text-lg font-semibold">Awaiting acceptance</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Proposed shares do not count as debts until the participant accepts.
      </p>
      {notFound ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
          Invitation not found.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <div className="mt-4 grid gap-3">
        {awaiting.length === 0 ? (
          <EmptyState>Nothing is waiting for an answer.</EmptyState>
        ) : (
          awaiting.map((debt) => (
            <InvitationRow
              key={debt.id}
              debt={debt}
              viewerUserId={viewerUserId}
              isHighlighted={debt.sharedExpenseId === highlightedSharedExpenseId}
              disabled={isPending}
              respond={respond}
            />
          ))
        )}
      </div>
      {rejected.length > 0 ? (
        <section aria-label="Rejected shares" className="mt-6 grid gap-3">
          <h3 className="text-base font-semibold">Rejected</h3>
          {rejected.map((debt) => (
            <article
              key={debt.id}
              id={`share-${debt.sharedExpenseId}`}
              className={`rounded-md border p-3 text-sm ${
                debt.sharedExpenseId === highlightedSharedExpenseId
                  ? "border-pine ring-2 ring-pine/40"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <p className="font-semibold">{debt.sharedExpense.title}</p>
              <p className="text-slate-500 dark:text-slate-400">
                {participantName(debt)} rejected {formatMoney(debt.shareAmount, debt.currency)}.
              </p>
            </article>
          ))}
        </section>
      ) : null}
    </Card>
  );
}
