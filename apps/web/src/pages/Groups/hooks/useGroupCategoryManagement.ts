import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as categoriesClient from "../../../services/categories.client";
import * as groupsClient from "../../../services/groups.client";
import type { Category, CategoryFormValues } from "../../../types/categories.types";

/** Mutations and edit-selection state for a group's shared categories; form field state lives in `CategoryForm`. */
export function useGroupCategoryManagement({
  selectedGroupId,
  refreshSelectedGroup
}: {
  selectedGroupId: string | null;
  refreshSelectedGroup: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );

  const addCategory = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      groupsClient.addGroupCategory(selectedGroupId!, values),
    onSuccess: async () => {
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  });

  const updateCategory = useMutation({
    mutationFn: (category: { id: string } & CategoryFormValues) =>
      categoriesClient.updateCategory(category.id, {
        name: category.name,
        type: category.type,
        color: category.color
      }),
    onSuccess: async () => {
      closeCategoryEditForm();
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const archiveCategory = useMutation({
    mutationFn: (categoryId: string) =>
      categoriesClient.archiveCategory(categoryId),
    onSuccess: async () => {
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const restoreCategory = useMutation({
    mutationFn: (categoryId: string) =>
      categoriesClient.restoreCategory(categoryId),
    onSuccess: async () => {
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  });

  const deleteCategory = useMutation({
    mutationFn: (categoryId: string) =>
      categoriesClient.deleteCategory(categoryId),
    onSuccess: async () => {
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  function openCategoryEditForm(category: Category) {
    setEditingCategoryId(category.id);
  }

  function closeCategoryEditForm() {
    setEditingCategoryId(null);
  }

  async function confirmDeleteCategory(category: Category) {
    const confirmed = window.confirm(
      `Delete "${category.name}" permanently? This cannot be undone. Related financial data may also be deleted or disconnected from this category.`
    );
    if (!confirmed) return;
    await deleteCategory.mutateAsync(category.id);
  }

  return {
    editingCategoryId,
    addCategory,
    updateCategory,
    archiveCategory,
    restoreCategory,
    deleteCategory,
    openCategoryEditForm,
    closeCategoryEditForm,
    confirmDeleteCategory
  };
}
