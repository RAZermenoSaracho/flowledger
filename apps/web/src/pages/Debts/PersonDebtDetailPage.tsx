import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Card } from "../../components/Card";
import { routes } from "../../constants/routes";
import { useAuth } from "../../hooks/useAuth";
import { listAccounts } from "../../services/accounts.client";
import { listCategories } from "../../services/categories.client";
import * as debtsClient from "../../services/debts.client";
import { listGroups } from "../../services/groups.client";
import { PersonDebtDetail } from "./components/PersonDebtDetail";
import { useDebtSettlementWorkflow } from "./hooks/useDebtSettlementWorkflow";
import { availableSettlementAmount } from "./utils/debtDisplay";

/**
 * Independent detail page for a single counterparty's debt balance, reached by
 * clicking a card on the Outstanding Balances tab (or a debt-related
 * notification, via `?debtId=` for scroll-to-highlight).
 */
export function PersonDebtDetailPage() {
  const auth = useAuth();
  const summaryCurrency = auth.user?.preferredCurrency || "USD";
  const { personKey } = useParams();
  const [searchParams] = useSearchParams();
  const highlightedDebtId = searchParams.get("debtId");

  const debtsQuery = useQuery({
    queryKey: ["debts"],
    queryFn: async () => debtsClient.listDebts()
  });
  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await listAccounts()).accounts
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await listCategories()).categories
  });
  const groupsQuery = useQuery({
    queryKey: ["groups"],
    queryFn: async () => (await listGroups()).groups
  });

  const privateExpenseCategories = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (category) => category.type === "expense" && !category.groupId
      ),
    [categoriesQuery.data]
  );
  const privateIncomeCategories = useMemo(
    () =>
      (categoriesQuery.data ?? []).filter(
        (category) => category.type === "income" && !category.groupId
      ),
    [categoriesQuery.data]
  );
  const groupById = useMemo(
    () => new Map((groupsQuery.data ?? []).map((group) => [group.id, group])),
    [groupsQuery.data]
  );

  const workflow = useDebtSettlementWorkflow({
    groupById,
    privateExpenseCategories,
    privateIncomeCategories,
    accounts: accountsQuery.data ?? []
  });

  const balance = debtsQuery.data?.balances.find(
    (candidate) => candidate.key === personKey
  );
  const selectedIOweThem = useMemo(
    () =>
      (balance?.iOweThem ?? []).filter(
        (debt) =>
          workflow.selectedDebtIds.has(debt.id) &&
          availableSettlementAmount(debt) > 0
      ),
    [balance?.iOweThem, workflow.selectedDebtIds]
  );

  useEffect(() => {
    if (!highlightedDebtId || debtsQuery.isLoading) return;
    window.requestAnimationFrame(() => {
      document
        .getElementById(`debt-${highlightedDebtId}`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [debtsQuery.isLoading, highlightedDebtId]);

  return (
    <div className="grid min-w-0 gap-4">
      <Link
        to={`${routes.debts}?tab=balances`}
        className="inline-flex w-fit text-sm font-semibold text-pine dark:text-emerald-300"
      >
        Back to balances
      </Link>

      {debtsQuery.isLoading ? (
        <Card>Loading balance...</Card>
      ) : debtsQuery.isError ? (
        <Card>Could not load this balance.</Card>
      ) : !balance ? (
        <Card>
          This balance is no longer outstanding, or could not be found.
        </Card>
      ) : (
        <PersonDebtDetail
          balance={balance}
          summaryCurrency={summaryCurrency}
          viewerUserId={auth.user?.id}
          selectedDebtIds={workflow.selectedDebtIds}
          selectedIOweThem={selectedIOweThem}
          accounts={accountsQuery.data ?? []}
          isActing={workflow.isActing}
          highlightedDebtId={highlightedDebtId}
          draftFor={workflow.draftFor}
          isSettlementDraftComplete={workflow.isSettlementDraftComplete}
          updateDraft={workflow.updateDraft}
          categoryOptionsFor={workflow.categoryOptionsFor}
          onToggleDebt={workflow.toggleDebtSelection}
          onSelectDebts={workflow.setDetailSelection}
          onSubmitSettlement={workflow.submitSettlement}
          onSubmitBatchSettlement={(event) =>
            workflow.submitBatchSettlement(event, selectedIOweThem)
          }
        />
      )}
    </div>
  );
}
