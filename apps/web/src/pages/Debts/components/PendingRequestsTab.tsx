import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../../components/Button";
import { ListView } from "../../../components/ListView";
import { SearchBar, type SearchBarQuery } from "../../../components/SearchBar";
import { Tabs } from "../../../components/Tabs";
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

/**
 * Tab listing pending settlement requests as two sub-tabs, "Requests by me" (`byMe`) and
 * "Awaiting my approval" (`forMe`); only the selected one renders. The selection lives in the
 * `pending` URL param (other params are preserved). When it is absent or invalid, the sub-tab
 * holding the highlighted settlement opens, else `byMe`. Approval drafts and selection live in the
 * parent workflow, so they survive switching; a list's search is cleared when its tab is shown again.
 */
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
  onSubmitBatchApproval,
  isLoading,
  error
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
  isLoading?: boolean;
  error?: string | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pendingParam = searchParams.get("pending");
  const activeId =
    pendingParam === "byMe" || pendingParam === "forMe"
      ? pendingParam
      : pendingForMe.some((request) => request.id === highlightedSettlementId)
        ? "forMe"
        : "byMe";

  function selectTab(id: string) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set("pending", id);
        return next;
      },
      { replace: true }
    );
  }

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

  const byMeList = (
    <ListView
      // Both lists sit at the same position inside `Tabs`; distinct keys force a remount so the
      // remounted SearchBar re-emits its empty query and the parent filter matches the empty box.
      key="byMe"
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
      isLoading={isLoading}
      error={error}
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
  );

  const forMeList = (
    <ListView
      key="forMe"
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
      isLoading={isLoading}
      error={error}
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
  );

  return (
    <Tabs
      idPrefix="pending-"
      activeId={activeId}
      onSelect={selectTab}
      tabs={[
        {
          id: "byMe",
          label: "Requests by me",
          badge: pendingFromMe.length,
          content: byMeList
        },
        {
          id: "forMe",
          label: "Awaiting my approval",
          badge: pendingForMe.length,
          content: forMeList
        }
      ]}
    />
  );
}
