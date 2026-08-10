import type { GroupRole } from "@flowledger/shared";
import type { Category } from "./categories.types";
import type { Transaction } from "./transactions.types";
import type { PublicUser } from "./users.types";

/** Group membership record shape. */
export type GroupMember = {
  id: string;
  groupId: string;
  userId: string;
  role: GroupRole;
  user: PublicUser;
  createdAt: string;
  updatedAt: string;
};

/** Group record shape with its categories, members, and optional transactions/summary. */
export type Group = {
  id: string;
  name: string;
  description?: string | null;
  ownerUserId: string;
  isArchived: boolean;
  archivedAt?: string | null;
  members: GroupMember[];
  categories: Category[];
  transactions?: Transaction[];
  summary?: {
    totalIncome: number;
    totalExpenses: number;
    balance: number;
  };
  createdAt: string;
  updatedAt: string;
};
