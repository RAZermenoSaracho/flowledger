import { RelatedList } from "../../../components/RelatedList";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { formatMoney } from "../../../utils/currency";
import { formatEnumLabel } from "../../../utils/enumLabels";

/** Participants tab of the Shared Expense Form View: a read-only list; the owner also gets a link to manage participants on the transaction's Sharing tab via `onManage`. */
export function SharedExpenseParticipantsTab({
  sharedExpense,
  onManage
}: {
  sharedExpense: SharedExpense;
  onManage?: () => void;
}) {
  return (
    <div className="grid gap-3">
      <RelatedList
        title="Participants"
        rows={sharedExpense.participants}
        rowKey={(participant) => participant.id}
        emptyText="No participants yet."
        columns={[
          {
            key: "participant",
            header: "Participant",
            cell: (participant) => (
              <span id={`shared-participant-${participant.id}`}>
                {participant.participantName}
              </span>
            )
          },
          {
            key: "kind",
            header: "Kind",
            cell: (participant) => (participant.userId ? "App user" : "Manual")
          },
          {
            key: "share",
            header: "Share",
            cell: (participant) =>
              formatMoney(participant.shareAmount, participant.currency)
          },
          {
            key: "paid",
            header: "Paid",
            cell: (participant) =>
              formatMoney(participant.paidAmount, participant.currency)
          },
          {
            key: "status",
            header: "Status",
            cell: (participant) => formatEnumLabel(participant.status)
          },
          {
            key: "response",
            header: "Response",
            cell: (participant) =>
              formatEnumLabel(participant.acceptance ?? "accepted")
          }
        ]}
      />
      {onManage ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Participants and shares are edited on the transaction.{" "}
          <button
            type="button"
            className="text-pine underline"
            onClick={onManage}
          >
            Manage participants on the transaction
          </button>
        </p>
      ) : null}
    </div>
  );
}
