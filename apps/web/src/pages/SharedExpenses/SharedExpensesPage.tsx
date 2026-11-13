import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { SearchBarQuery } from "../../components/SearchBar";
import { useAuth } from "../../hooks/useAuth";
import { useScrollToHighlight } from "../../hooks/useScrollToHighlight";
import * as sharedExpensesClient from "../../services/sharedExpenses.client";
import {
  sharedExpenseGroupKey,
  SharedExpensesListCard
} from "./components/SharedExpensesListCard";
import { groupByFields } from "../../utils/groupByFields";

/** Shared expenses list page with search/filter/group controls; rows open the Shared Expense view. */
export function SharedExpensesPage() {
  const auth = useAuth();
  const [searchParams] = useSearchParams();
  const highlightedSharedExpenseId = searchParams.get("sharedExpenseId");
  const highlightedParticipantId = searchParams.get("participantId");
  const [sharedExpenseQuery, setSharedExpenseQuery] = useState<SearchBarQuery>(
    {}
  );

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
  const groupedSharedExpenses = useMemo(
    () =>
      groupByFields(visibleSharedExpenses, sharedExpenseQuery.groupBy, sharedExpenseGroupKey),
    [visibleSharedExpenses, sharedExpenseQuery.groupBy]
  );

  useScrollToHighlight(
    highlightedParticipantId
      ? `shared-participant-${highlightedParticipantId}`
      : highlightedSharedExpenseId
        ? `shared-expense-${highlightedSharedExpenseId}`
        : null,
    sharedExpensesQuery.isLoading
  );

  return (
    <div className="grid gap-6">
      <SharedExpensesListCard
        onQueryChange={setSharedExpenseQuery}
        sharedExpenses={visibleSharedExpenses}
        groupedSharedExpenses={groupedSharedExpenses}
        isLoading={sharedExpensesQuery.isLoading}
        error={sharedExpensesQuery.error?.message}
        highlightedSharedExpenseId={highlightedSharedExpenseId}
        highlightedParticipantId={highlightedParticipantId}
        currentUserId={auth.user?.id}
      />
    </div>
  );
}
