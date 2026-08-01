import type { CategoryType } from "@flowledger/shared";

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
