import type { FormEvent } from "react";
import { Button } from "../../../components/Button";
import { ListView } from "../../../components/ListView";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import type { ListSelection } from "../../../types/common.types";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { SettlementRequest } from "../../../types/debts.types";
import type { SettlementApprovalDraft } from "../types/debts.types";
import {
  SETTLEMENT_REQUEST_DEFAULT_SEARCH_FIELD,
  settlementRequestSearchFields
} from "../utils/debtSearchFields";
import { ApprovalActions } from "./ApprovalActions";
import { SettlementRequestCard } from "./SettlementRequestCard";

/** Tab listing pending settlement requests both sent by and awaiting approval from the user. */
export function PendingRequestsTab({
  pendingFromMe,
  pendingForMe,
  visiblePendingFromMe,
  visiblePendingForMe,
  onPendingFromMeQueryChange,
  onPendingForMeQueryChange,
  highlightedSettlementId,
  approvalSelection,
  accounts,
  isActing,
  approvalDraftFor,
  onApprovalDraftChange,
  incomeCategoryOptionsFor,
  expenseOffsetCategoryOptionsFor,
  onApproveSettlement,
  onRejectSettlement,
  onSubmitBatchApproval
}: {
  pendingFromMe: SettlementRequest[];
  pendingForMe: SettlementRequest[];
  visiblePendingFromMe: SettlementRequest[];
  visiblePendingForMe: SettlementRequest[];
  onPendingFromMeQueryChange: (query: SearchBarQuery) => void;
  onPendingForMeQueryChange: (query: SearchBarQuery) => void;
  highlightedSettlementId?: string | null;
  approvalSelection: ListSelection;
  accounts: Account[];
  isActing: boolean;
  approvalDraftFor: (request: SettlementRequest) => SettlementApprovalDraft;
  onApprovalDraftChange: (
    request: SettlementRequest,
    field: keyof SettlementApprovalDraft,
    value: string
  ) => void;
  incomeCategoryOptionsFor: (request: SettlementRequest) => Category[];
  expenseOffsetCategoryOptionsFor: (request: SettlementRequest) => Category[];
  onApproveSettlement: (event: FormEvent, request: SettlementRequest) => void;
  onRejectSettlement: (settlementId: string) => void;
  onSubmitBatchApproval: (requests: SettlementRequest[]) => Promise<void>;
}) {
  const selectedApprovalRequests = visiblePendingForMe.filter((request) =>
    approvalSelection.isSelected(request.id)
  );
  const batchApprovalRequests =
    selectedApprovalRequests.length > 0
      ? selectedApprovalRequests
      : visiblePendingForMe;
  const canSubmitBatchApproval =
    batchApprovalRequests.length > 0 &&
    batchApprovalRequests.every((request) => {
      const draft = approvalDraftFor(request);
      return Boolean(draft.accountId && draft.categoryId);
    });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ListView
        title="Requests by me"
        subtitle="Review outgoing requests."
        toolbar={
          <SearchBar
            fields={settlementRequestSearchFields}
            defaultSearchField={SETTLEMENT_REQUEST_DEFAULT_SEARCH_FIELD}
            placeholder="Search requests by me"
            onQueryChange={onPendingFromMeQueryChange}
          />
        }
        items={visiblePendingFromMe}
        total={pendingFromMe.length}
        rowKey={(request) => request.id}
        emptyText={
          pendingFromMe.length === 0
            ? "No outgoing requests."
            : "No requests match your search."
        }
        renderItem={(request) => (
          <SettlementRequestCard
            request={request}
            isHighlighted={highlightedSettlementId === request.id}
          />
        )}
      />
      <ListView
        title="Awaiting my approval"
        subtitle="Approvals waiting on you."
        toolbar={
          <SearchBar
            fields={settlementRequestSearchFields}
            defaultSearchField={SETTLEMENT_REQUEST_DEFAULT_SEARCH_FIELD}
            placeholder="Search approvals"
            onQueryChange={onPendingForMeQueryChange}
          />
        }
        items={visiblePendingForMe}
        total={pendingForMe.length}
        rowKey={(request) => request.id}
        emptyText={
          pendingForMe.length === 0
            ? "No requests to review."
            : "No requests match your search."
        }
        selection={pendingForMe.length > 0 ? approvalSelection : undefined}
        itemLabel={(request) =>
          `Select ${request.sharedExpenseParticipant?.sharedExpense.title ?? "settlement request"}`
        }
        bulkActions={
          <Button
            type="button"
            disabled={isActing || !canSubmitBatchApproval}
            onClick={() => onSubmitBatchApproval(batchApprovalRequests)}
          >
            {selectedApprovalRequests.length > 0
              ? "Settle selected"
              : "Settle all"}
          </Button>
        }
        renderItem={(request) => (
          <SettlementRequestCard
            request={request}
            isHighlighted={highlightedSettlementId === request.id}
            actions={
              <ApprovalActions
                request={request}
                accounts={accounts}
                incomeCategories={incomeCategoryOptionsFor(request)}
                expenseOffsetCategories={expenseOffsetCategoryOptionsFor(request)}
                draft={approvalDraftFor(request)}
                isActing={isActing}
                onDraftChange={(field, value) =>
                  onApprovalDraftChange(request, field, value)
                }
                onApprove={(event) => onApproveSettlement(event, request)}
                onReject={() => onRejectSettlement(request.id)}
              />
            }
          />
        )}
      />
    </div>
  );
}
