import type { CategoryType } from "@flowledger/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import * as categoriesClient from "../../../services/categories.client";
import * as groupsClient from "../../../services/groups.client";
import type { Group } from "../../../types/groups.types";

/** State and handlers for adding and archiving a group's shared categories. */
export function useGroupCategoryManagement({
  selectedGroupId,
  refreshSelectedGroup
}: {
  selectedGroupId: string | null;
  refreshSelectedGroup: () => Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<CategoryType>("expense");
  const [categoryColor, setCategoryColor] = useState("#176b52");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );
  const [editCategoryName, setEditCategoryName] = useState("");
  const [editCategoryType, setEditCategoryType] =
    useState<CategoryType>("expense");
  const [editCategoryColor, setEditCategoryColor] = useState("#176b52");

  const addCategory = useMutation({
    mutationFn: () =>
      groupsClient.addGroupCategory(selectedGroupId!, {
        name: categoryName,
        type: categoryType,
        color: categoryColor
      }),
    onSuccess: async () => {
      setCategoryName("");
      await refreshSelectedGroup();
    }
  });

  const updateCategory = useMutation({
    mutationFn: (category: {
      id: string;
      name: string;
      type: CategoryType;
      color: string;
    }) =>
      categoriesClient.updateCategory(category.id, {
        name: category.name,
        type: category.type,
        color: category.color
      }),
    onSuccess: async () => {
      closeCategoryEditForm();
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const archiveCategory = useMutation({
    mutationFn: (categoryId: string) =>
      categoriesClient.archiveCategory(categoryId),
    onSuccess: async () => {
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const restoreCategory = useMutation({
    mutationFn: (categoryId: string) =>
      categoriesClient.restoreCategory(categoryId),
    onSuccess: refreshSelectedGroup
  });

  const deleteCategory = useMutation({
    mutationFn: (categoryId: string) =>
      categoriesClient.deleteCategory(categoryId),
    onSuccess: async () => {
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    await addCategory.mutateAsync();
  }

  async function submitCategoryEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingCategoryId) return;

    await updateCategory.mutateAsync({
      id: editingCategoryId,
      name: editCategoryName,
      type: editCategoryType,
      color: editCategoryColor
    });
  }

  function openCategoryEditForm(category: Group["categories"][number]) {
    setEditingCategoryId(category.id);
    setEditCategoryName(category.name);
    setEditCategoryType(category.type);
    setEditCategoryColor(category.color ?? "#176b52");
  }

  function closeCategoryEditForm() {
    setEditingCategoryId(null);
    setEditCategoryName("");
    setEditCategoryType("expense");
    setEditCategoryColor("#176b52");
  }

  async function confirmDeleteCategory(category: Group["categories"][number]) {
    const confirmed = window.confirm(
      `Delete "${category.name}" permanently? This cannot be undone. Related financial data may also be deleted or disconnected from this category.`
    );
    if (!confirmed) return;
    await deleteCategory.mutateAsync(category.id);
  }

  return {
    categoryName,
    setCategoryName,
    categoryType,
    setCategoryType,
    categoryColor,
    setCategoryColor,
    editingCategoryId,
    editCategoryName,
    setEditCategoryName,
    editCategoryType,
    setEditCategoryType,
    editCategoryColor,
    setEditCategoryColor,
    addCategory,
    updateCategory,
    archiveCategory,
    restoreCategory,
    deleteCategory,
    submitCategory,
    submitCategoryEdit,
    openCategoryEditForm,
    closeCategoryEditForm,
    confirmDeleteCategory
  };
}
