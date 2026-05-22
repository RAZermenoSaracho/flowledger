import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput } from "../components/FormField";
import { apiRequest } from "../services/api";
import type { Category } from "../types/api";

export function CategoriesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<CategoryType>("expense");
  const [color, setColor] = useState("#176b52");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(
    null
  );
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState<CategoryType>("expense");
  const [editColor, setEditColor] = useState("#176b52");
  const [showArchived, setShowArchived] = useState(false);

  const categoriesQuery = useQuery({
    queryKey: ["categories", showArchived],
    queryFn: async () =>
      (
        await apiRequest<{ categories: Category[] }>("/categories", {
          query: { includeArchived: showArchived ? "true" : undefined }
        })
      ).categories
  });

  const createCategory = useMutation({
    mutationFn: () =>
      apiRequest("/categories", {
        method: "POST",
        body: { name, type, color }
      }),
    onSuccess: async () => {
      setName("");
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  });

  const updateCategory = useMutation({
    mutationFn: (category: {
      id: string;
      name: string;
      type: CategoryType;
      color: string;
    }) =>
      apiRequest(`/categories/${category.id}`, {
        method: "PUT",
        body: {
          name: category.name,
          type: category.type,
          color: category.color
        }
      }),
    onSuccess: async () => {
      closeEditForm();
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["category-report"] });
    }
  });

  const archiveCategory = useMutation({
    mutationFn: (categoryId: string) =>
      apiRequest(`/categories/${categoryId}/archive`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const restoreCategory = useMutation({
    mutationFn: (categoryId: string) =>
      apiRequest(`/categories/${categoryId}/restore`, { method: "POST" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  });

  const deleteCategory = useMutation({
    mutationFn: (categoryId: string) =>
      apiRequest(`/categories/${categoryId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["category-report"] });
    }
  });

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    await createCategory.mutateAsync();
  }

  function closeForm() {
    setName("");
    setType("expense");
    setColor("#176b52");
    setIsFormOpen(false);
  }

  function openEditForm(category: Category) {
    setEditingCategoryId(category.id);
    setEditName(category.name);
    setEditType(category.type);
    setEditColor(category.color ?? "#176b52");
  }

  function closeEditForm() {
    setEditingCategoryId(null);
    setEditName("");
    setEditType("expense");
    setEditColor("#176b52");
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!editingCategoryId) return;

    await updateCategory.mutateAsync({
      id: editingCategoryId,
      name: editName,
      type: editType,
      color: editColor
    });
  }

  async function confirmDelete(category: Category) {
    const confirmed = window.confirm(
      `Delete "${category.name}" permanently? This cannot be undone. Related financial data may also be deleted or disconnected from this category.`
    );
    if (!confirmed) return;
    await deleteCategory.mutateAsync(category.id);
  }

  return (
    <div className="grid gap-6">
      <Card>
        {isFormOpen ? (
          <>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-semibold">New category</h2>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={closeForm}
              >
                Cancel
              </Button>
            </div>
            <form
              className="mt-4 grid gap-4 md:grid-cols-3"
              onSubmit={submitCreate}
            >
              <TextInput
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <SelectField
                label="Type"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as CategoryType)
                }
              >
                {CATEGORY_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectField>
              <TextInput
                label="Color"
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
              <div className="md:col-span-3">
                <Button type="submit" disabled={createCategory.isPending}>
                  Save category
                </Button>
              </div>
            </form>
          </>
        ) : (
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={() => setIsFormOpen(true)}
          >
            Add category
          </Button>
        )}
      </Card>
      <Card>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h2 className="text-lg font-semibold">Categories</h2>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(categoriesQuery.data ?? []).map((category) => (
            <div
              key={category.id}
              className="rounded-md border border-slate-200 p-3 dark:border-slate-800"
            >
              {editingCategoryId === category.id ? (
                <form className="grid gap-3" onSubmit={submitEdit}>
                  <TextInput
                    label="Name"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    required
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <SelectField
                      label="Type"
                      value={editType}
                      onChange={(event) =>
                        setEditType(event.target.value as CategoryType)
                      }
                    >
                      {CATEGORY_TYPES.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </SelectField>
                    <TextInput
                      label="Color"
                      type="color"
                      value={editColor}
                      onChange={(event) => setEditColor(event.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button type="submit" disabled={updateCategory.isPending}>
                      Save changes
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={closeEditForm}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ background: category.color ?? "#cbd5e1" }}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{category.name}</p>
                      {category.isArchived ? (
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          Archived
                        </span>
                      ) : null}
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {category.type}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={() => openEditForm(category)}
                  >
                    Edit
                  </Button>
                  {category.isArchived ? (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      disabled={restoreCategory.isPending}
                      onClick={() => restoreCategory.mutate(category.id)}
                    >
                      Restore
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      className="w-full sm:w-auto"
                      disabled={archiveCategory.isPending}
                      onClick={() => archiveCategory.mutate(category.id)}
                    >
                      Archive
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    className="w-full sm:w-auto"
                    disabled={deleteCategory.isPending}
                    onClick={() => confirmDelete(category)}
                  >
                    Delete
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
