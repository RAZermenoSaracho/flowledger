import type { CategoryType } from "@flowledger/shared";

/** Category record shape as returned by the API. */
export type Category = {
  id: string;
  groupId?: string | null;
  name: string;
  type: CategoryType;
  color?: string | null;
  isArchived: boolean;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};
