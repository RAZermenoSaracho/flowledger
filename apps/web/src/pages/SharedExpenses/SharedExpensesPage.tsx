import type { SharedExpenseStatus } from "@flowledger/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import * as sharedExpensesClient from "../../services/sharedExpenses.client";
import type { SharedExpenseSortBy } from "../../services/sharedExpenses.client";
import { matchesSearch } from "../../utils/search";
import { SharedExpenseFormCard } from "./components/SharedExpenseFormCard";
import { splitDirectionLabel } from "./components/SharedExpenseListItem";
import {
  groupByFields,
  sharedExpenseGroupByDefs,
  sharedExpenseGroupKey,
  SharedExpensesListCard
} from "./components/SharedExpensesListCard";
import { useSharedExpenseForm } from "./hooks/useSharedExpenseForm";

/** Shared expenses list page with search/filter/group controls and create/edit form. */
export function SharedExpensesPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const highlightedSharedExpenseId = searchParams.get("sharedExpenseId");
  const highlightedParticipantId = searchParams.get("participantId");
  const [search, setSearch] = useState("");
  const [statusFilterValues, setStatusFilterValues] = useState<string[]>([]);
  const [groupBys, setGroupBys] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SharedExpenseSortBy>("createdAt");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const form = useSharedExpenseForm();

  const sharedExpensesQuery = useQuery({
    queryKey: ["shared-expenses", statusFilterValues, sortBy, sortDirection],
    queryFn: async () =>
      (
        await sharedExpensesClient.listSharedExpenses({
          statuses:
            statusFilterValues.length > 0
              ? (statusFilterValues as SharedExpenseStatus[])
              : undefined,
          sortBy,
          sortDirection
        })
      ).sharedExpenses
  });

  const visibleSharedExpenses = useMemo(
    () =>
      (sharedExpensesQuery.data ?? []).filter((sharedExpense) =>
        matchesSearch(
          [
            sharedExpense.title,
            sharedExpense.status,
            splitDirectionLabel(sharedExpense),
            sharedExpense.transaction?.name,
            ...sharedExpense.participants.map(
              (participant) => participant.participantName
            )
          ],
          search
        )
      ),
    [search, sharedExpensesQuery.data]
  );

  const groupedSharedExpenses = useMemo(
    () =>
      groupByFields(
        visibleSharedExpenses,
        groupBys,
        sharedExpenseGroupByDefs,
        sharedExpenseGroupKey
      ),
    [visibleSharedExpenses, groupBys]
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
        search={search}
        onSearchChange={setSearch}
        statusFilterValues={statusFilterValues}
        onStatusFilterValuesChange={setStatusFilterValues}
        groupBys={groupBys}
        onGroupBysChange={setGroupBys}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortByChange={setSortBy}
        onSortDirectionChange={setSortDirection}
        groupedSharedExpenses={groupedSharedExpenses}
        visibleCount={visibleSharedExpenses.length}
        highlightedSharedExpenseId={highlightedSharedExpenseId}
        highlightedParticipantId={highlightedParticipantId}
        currentUserId={auth.user?.id}
        onEdit={form.editSharedExpense}
      />
    </div>
  );
}
