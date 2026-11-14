import { useQuery } from "@tanstack/react-query";
import { listAccounts } from "../../../services/accounts.client";
import { listCategories } from "../../../services/categories.client";
import { listGroups } from "../../../services/groups.client";
import type { BindingOptions } from "../types/notificationModels.types";

/** The caller's non-archived accounts, categories and groups as `{ id, name }` options for slot binding selects. */
export function useBindingOptions(): BindingOptions {
  const accounts = useQuery({ queryKey: ["accounts", "all"], queryFn: async () => (await listAccounts()).accounts });
  const categories = useQuery({ queryKey: ["categories"], queryFn: async () => (await listCategories()).categories });
  const groups = useQuery({ queryKey: ["groups"], queryFn: async () => (await listGroups()).groups });
  const options = <T extends { id: string; name: string; isArchived: boolean }>(rows: T[] | undefined) =>
    (rows ?? []).filter((row) => !row.isArchived).map((row) => ({ id: row.id, name: row.name }));
  return {
    account: options(accounts.data),
    category: options(categories.data),
    group: options(groups.data)
  };
}
