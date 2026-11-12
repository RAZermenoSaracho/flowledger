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

/** Editable category fields shared by the create and edit forms. */
export type CategoryFormValues = {
  name: string;
  type: CategoryType;
  color: string;
};

/** Handlers and pending flags behind a `CategoryCard`'s Edit / Archive / Restore / Delete menu. */
export type CategoryCardActions = {
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  archivePending?: boolean;
  restorePending?: boolean;
  deletePending?: boolean;
};
