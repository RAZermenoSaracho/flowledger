import type { FormEvent } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { SettlementRequest } from "../../../types/debts.types";
import type { SettlementApprovalDraft } from "../types/debts.types";
import {
  SETTLEMENT_REQUEST_DEFAULT_SEARCH_FIELD,
  settlementRequestSearchFields
} from "../utils/debtSearchFields";
import { ApprovalActions } from "./ApprovalActions";
import { EmptyState } from "./EmptyState";
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
  selectedApprovalIds,
  onToggleApprovalSelection,
  onSetApprovalSelection,
  onClearApprovalSelection,
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
  selectedApprovalIds: Set<string>;
  onToggleApprovalSelection: (settlementId: string) => void;
  onSetApprovalSelection: (
    requests: SettlementRequest[],
    selected: boolean
  ) => void;
  onClearApprovalSelection: () => void;
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
    selectedApprovalIds.has(request.id)
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
  const allVisibleApprovalsSelected =
    visiblePendingForMe.length > 0 &&
    visiblePendingForMe.every((request) => selectedApprovalIds.has(request.id));

  return (
    <Card>
      <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-lg font-semibold">Pending settlement requests</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Review outgoing requests and approvals waiting on you.
          </p>
        </div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
          {visiblePendingFromMe.length + visiblePendingForMe.length} of{" "}
          {pendingFromMe.length + pendingForMe.length}
        </p>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
              Requests by me
            </h3>
            <div className="mt-3">
              <SearchBar
                fields={settlementRequestSearchFields}
                defaultSearchField={SETTLEMENT_REQUEST_DEFAULT_SEARCH_FIELD}
                placeholder="Search requests by me"
                onQueryChange={onPendingFromMeQueryChange}
              />
            </div>
          </div>
          {pendingFromMe.length === 0 ? (
            <EmptyState>No outgoing requests.</EmptyState>
          ) : visiblePendingFromMe.length === 0 ? (
            <EmptyState>No requests match your search.</EmptyState>
          ) : (
            visiblePendingFromMe.map((request) => (
              <SettlementRequestCard
                key={request.id}
                request={request}
                isHighlighted={highlightedSettlementId === request.id}
              />
            ))
          )}
        </div>
        <div className="grid gap-3">
          <div>
            <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
              Awaiting my approval
            </h3>
            <div className="mt-3">
              <SearchBar
                fields={settlementRequestSearchFields}
                defaultSearchField={SETTLEMENT_REQUEST_DEFAULT_SEARCH_FIELD}
                placeholder="Search approvals"
                onQueryChange={onPendingForMeQueryChange}
              />
            </div>
          </div>
          {pendingForMe.length > 0 ? (
            <div className="grid w-full gap-2 rounded-md border border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-3">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={
                  visiblePendingForMe.length === 0 ||
                  allVisibleApprovalsSelected
                }
                onClick={() =>
                  onSetApprovalSelection(visiblePendingForMe, true)
                }
              >
                Select all
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={selectedApprovalIds.size === 0}
                onClick={onClearApprovalSelection}
              >
                Clear selection
              </Button>
              <Button
                type="button"
                className="w-full"
                disabled={isActing || !canSubmitBatchApproval}
                onClick={() => onSubmitBatchApproval(batchApprovalRequests)}
              >
                {selectedApprovalRequests.length > 0
                  ? "Settle selected"
                  : "Settle all"}
              </Button>
            </div>
          ) : null}
          {pendingForMe.length === 0 ? (
            <EmptyState>No requests to review.</EmptyState>
          ) : visiblePendingForMe.length === 0 ? (
            <EmptyState>No requests match your search.</EmptyState>
          ) : (
            visiblePendingForMe.map((request) => (
              <SettlementRequestCard
                key={request.id}
                request={request}
                isHighlighted={highlightedSettlementId === request.id}
                selectable
                isSelected={selectedApprovalIds.has(request.id)}
                onSelectedChange={() => onToggleApprovalSelection(request.id)}
                actions={
                  <ApprovalActions
                    request={request}
                    accounts={accounts}
                    incomeCategories={incomeCategoryOptionsFor(request)}
                    expenseOffsetCategories={expenseOffsetCategoryOptionsFor(
                      request
                    )}
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
            ))
          )}
        </div>
      </div>
    </Card>
  );
}
