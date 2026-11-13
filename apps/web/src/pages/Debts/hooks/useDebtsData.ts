import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { listAccounts } from "../../../services/accounts.client";
import { listCategories } from "../../../services/categories.client";
import * as debtsClient from "../../../services/debts.client";
import { listGroups } from "../../../services/groups.client";
import { useDebtSettlementWorkflow } from "./useDebtSettlementWorkflow";

/**
 * Returns the debts query, accounts, and settlement workflow for the Debts pages.
 * Private (non-group) categories and the group lookup stay internal to the workflow setup.
 * Each call creates its own workflow instance, so pages that call it keep independent draft and
 * selection state while sharing the same query cache entries.
 */
export function useDebtsData() {
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

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
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
    accounts
  });

  return {
    debtsQuery,
    accounts,
    workflow
  };
}
