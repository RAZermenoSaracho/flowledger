import { Link } from "react-router-dom";
import { ListView } from "../../../components/ListView";
import {
  RecordCard,
  type RecordCardAction
} from "../../../components/RecordCard";
import { routes } from "../../../constants/routes";
import type { Debt } from "../../../types/debts.types";
import { formatMoney } from "../../../utils/currency";
import { formatPublicUser } from "../../../utils/publicUser";
import { useShareResponse } from "../hooks/useShareResponse";
import { participantName } from "../utils/debtDisplay";

const HIGHLIGHT_CLASS =
  "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950";

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
  const ownerLabel = sharedExpense.owner
    ? formatPublicUser(sharedExpense.owner)
    : "the owner";
  const isMine = debt.userId === viewerUserId;
  const share = formatMoney(debt.shareAmount, debt.currency);

  const actions: RecordCardAction[] | undefined = isMine
    ? [
        {
          key: "accept",
          label: "Accept",
          variant: "primary",
          onClick: () =>
            respond({
              kind: "accept",
              sharedExpenseId: sharedExpense.id,
              participantId: debt.id
            }),
          disabled
        },
        {
          key: "reject",
          label: "Reject",
          variant: "secondary",
          onClick: () =>
            respond({
              kind: "reject",
              sharedExpenseId: sharedExpense.id,
              participantId: debt.id
            }),
          disabled
        },
        {
          key: "rejectAndBlock",
          label: "Reject and block",
          variant: "danger",
          onClick: () =>
            respond({
              kind: "rejectAndBlock",
              sharedExpenseId: sharedExpense.id,
              ownerUserId: sharedExpense.ownerUserId,
              participantId: debt.id
            }),
          disabled
        }
      ]
    : undefined;

  return (
    <RecordCard
      id={`share-${sharedExpense.id}`}
      actions={actions}
      actionsLabel={`Actions for ${sharedExpense.title}`}
      highlightClassName={isHighlighted ? HIGHLIGHT_CLASS : undefined}
      title={<RowTitle debt={debt} />}
      subtitle={
        <p className="text-sm text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]">
          {isMine
            ? `${ownerLabel} asks you to cover ${share}`
            : `${participantName(debt)} owes you ${share}`}
        </p>
      }
    >
      {!isMine && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
          Waiting for their answer.
        </p>
      )}
    </RecordCard>
  );
}

function RowTitle({ debt }: { debt: Debt }) {
  return (
    <Link
      to={routes.sharedExpense(debt.sharedExpenseId)}
      className="font-semibold text-pine hover:underline dark:text-emerald-300 [overflow-wrap:anywhere]"
    >
      {debt.sharedExpense.title}
    </Link>
  );
}

function RejectedRow({
  debt,
  isHighlighted
}: {
  debt: Debt;
  isHighlighted: boolean;
}) {
  return (
    <RecordCard
      id={`share-${debt.sharedExpenseId}`}
      highlightClassName={isHighlighted ? HIGHLIGHT_CLASS : undefined}
      title={<RowTitle debt={debt} />}
      subtitle={
        <p className="text-slate-500 dark:text-slate-400">
          {participantName(debt)} rejected{" "}
          {formatMoney(debt.shareAmount, debt.currency)}.
        </p>
      }
    />
  );
}

/**
 * Debts tab listing shares not yet answered, in "Awaiting your response" and "Rejected" groups:
 * a participant accepts, rejects or "rejects and blocks" the owner (only the participant is offered
 * actions); an owner sees their own proposals as waiting, plus the shares that were rejected.
 * Row titles link to the Shared Expense view. `highlightedSharedExpenseId` (from a notification)
 * marks one row, or says the invitation was not found once `isLoading` is false and no row matches.
 */
export function AwaitingAcceptanceTab({
  awaiting,
  rejected,
  viewerUserId,
  highlightedSharedExpenseId,
  isLoading,
  error: loadError
}: {
  awaiting: Debt[];
  rejected: Debt[];
  viewerUserId?: string;
  highlightedSharedExpenseId?: string | null;
  isLoading: boolean;
  error?: string | null;
}) {
  const { respond, isPending, error } = useShareResponse();
  const notFound =
    Boolean(highlightedSharedExpenseId) &&
    !isLoading &&
    !loadError &&
    ![...awaiting, ...rejected].some(
      (debt) => debt.sharedExpenseId === highlightedSharedExpenseId
    );
  const rejectedIds = new Set(rejected.map((debt) => debt.id));
  const notices = [notFound ? "Invitation not found." : null, error].filter(
    Boolean
  );

  return (
    <ListView
      title="Awaiting acceptance"
      subtitle="Proposed shares do not count as debts until the participant accepts."
      toolbar={
        notices.length > 0 ? (
          <div className="grid gap-1">
            {notices.map((notice) => (
              <p
                key={notice}
                role="alert"
                className="text-sm font-medium text-red-600 dark:text-red-400"
              >
                {notice}
              </p>
            ))}
          </div>
        ) : undefined
      }
      groups={[
        { key: "awaiting", label: "Awaiting your response", items: awaiting },
        { key: "rejected", label: "Rejected", items: rejected }
      ]}
      rowKey={(debt) => debt.id}
      isLoading={isLoading}
      error={loadError}
      emptyText="Nothing is waiting for an answer."
      renderItem={(debt) => {
        const isHighlighted =
          debt.sharedExpenseId === highlightedSharedExpenseId;
        return rejectedIds.has(debt.id) ? (
          <RejectedRow debt={debt} isHighlighted={isHighlighted} />
        ) : (
          <InvitationRow
            debt={debt}
            viewerUserId={viewerUserId}
            isHighlighted={isHighlighted}
            disabled={isPending}
            respond={respond}
          />
        );
      }}
    />
  );
}
