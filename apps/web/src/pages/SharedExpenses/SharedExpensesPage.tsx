import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { SearchBarQuery } from "../../components/SearchBar";
import { useAuth } from "../../hooks/useAuth";
import * as sharedExpensesClient from "../../services/sharedExpenses.client";
import { SharedExpenseFormCard } from "./components/SharedExpenseFormCard";
import {
  sharedExpenseGroupKey,
  SharedExpensesListCard
} from "./components/SharedExpensesListCard";
import { groupByFields } from "../../utils/groupByFields";
import { SHARED_EXPENSE_GROUPABLE_FIELDS } from "./utils/sharedExpenseSearchFields";
import { useSharedExpenseForm } from "./hooks/useSharedExpenseForm";

const sharedExpenseGroupByDefsForBucketing = SHARED_EXPENSE_GROUPABLE_FIELDS.map(
  (field) => ({ id: field.name, label: field.label })
);

/** Shared expenses list page with search/filter/group controls and create/edit form. */
export function SharedExpensesPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const highlightedSharedExpenseId = searchParams.get("sharedExpenseId");
  const highlightedParticipantId = searchParams.get("participantId");
  const [sharedExpenseQuery, setSharedExpenseQuery] = useState<SearchBarQuery>(
    {}
  );

  const form = useSharedExpenseForm();

  const sharedExpensesQuery = useQuery({
    queryKey: ["shared-expenses", sharedExpenseQuery],
    queryFn: async () =>
      (
        await sharedExpensesClient.listSharedExpenses({
          where: sharedExpenseQuery.where,
          sort: sharedExpenseQuery.sort
        })
      ).sharedExpenses
  });

  const visibleSharedExpenses = useMemo(() => sharedExpensesQuery.data ?? [], [sharedExpensesQuery.data]);
  const activeGroupBys = useMemo(() => sharedExpenseQuery.groupBy ?? [], [sharedExpenseQuery.groupBy]);
  const groupedSharedExpenses = useMemo(
    () =>
      groupByFields(
        visibleSharedExpenses,
        activeGroupBys,
        sharedExpenseGroupByDefsForBucketing,
        sharedExpenseGroupKey
      ),
    [visibleSharedExpenses, activeGroupBys]
  );

  useEffect(() => {
    const targetId = highlightedParticipantId
      ? `shared-participant-${highlightedParticipantId}`
      : highlightedSharedExpenseId
        ? `shared-expense-${highlightedSharedExpenseId}`
        : null;
    if (!targetId || sharedExpensesQuery.isLoading) return;

    window.requestAnimationFrame(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [
    highlightedParticipantId,
    highlightedSharedExpenseId,
    sharedExpensesQuery.isLoading
  ]);

  return (
    <div className="grid gap-6">
      <SharedExpenseFormCard form={form} />
      <SharedExpensesListCard
        onQueryChange={setSharedExpenseQuery}
        onAddSharedExpense={() => form.setIsFormOpen(true)}
        sharedExpenses={visibleSharedExpenses}
        groupedSharedExpenses={
          activeGroupBys.length > 0 ? groupedSharedExpenses : undefined
        }
        isLoading={sharedExpensesQuery.isLoading}
        error={sharedExpensesQuery.error?.message}
        highlightedSharedExpenseId={highlightedSharedExpenseId}
        highlightedParticipantId={highlightedParticipantId}
        currentUserId={auth.user?.id}
        onEdit={form.editSharedExpense}
      />
    </div>
  );
}
