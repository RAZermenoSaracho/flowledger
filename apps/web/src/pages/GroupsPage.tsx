import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput, TextArea } from "../components/FormField";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../services/api";
import type { Group, PublicUser } from "../types/api";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export function GroupsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showArchivedGroups, setShowArchivedGroups] = useState(false);
  const [showArchivedCategories, setShowArchivedCategories] = useState(false);
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupDescription, setEditGroupDescription] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
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
  const trimmedUserSearch = userSearch.trim();

  const groupsQuery = useQuery({
    queryKey: ["groups", showArchivedGroups],
    queryFn: async () =>
      (
        await apiRequest<{ groups: Group[] }>("/groups", {
          query: { includeArchived: showArchivedGroups ? "true" : undefined }
        })
      ).groups
  });
  const selectedGroupQuery = useQuery({
    queryKey: ["groups", selectedGroupId, showArchivedCategories],
    enabled: Boolean(selectedGroupId),
    queryFn: async () =>
      (
        await apiRequest<{ group: Group }>(`/groups/${selectedGroupId}`, {
          query: {
            includeArchivedCategories: showArchivedCategories
              ? "true"
              : undefined
          }
        })
      ).group
  });
  const userSearchQuery = useQuery({
    queryKey: ["users", "search", trimmedUserSearch],
    enabled: Boolean(selectedGroupId) && trimmedUserSearch.length > 1,
    queryFn: async () =>
      (
        await apiRequest<{ users: PublicUser[] }>("/users/search", {
          query: { q: trimmedUserSearch, limit: "8" }
        })
      ).users
  });

  const selectedGroup =
    selectedGroupQuery.data ??
    (groupsQuery.data ?? []).find((group) => group.id === selectedGroupId);
  const canManage = selectedGroup?.members.some(
    (member) => member.userId === auth.user?.id && member.role === "admin"
  );
  const canManageActive = Boolean(canManage && !selectedGroup?.isArchived);

  const createGroup = useMutation({
    mutationFn: () =>
      apiRequest("/groups", {
        method: "POST",
        body: { name, description: description || null }
      }),
    onSuccess: async (response: unknown) => {
      const created = response as { group: Group };
      closeCreateForm();
      setSelectedGroupId(created.group.id);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
    }
  });

  const addMember = useMutation({
    mutationFn: (userId: string) =>
      apiRequest(`/groups/${selectedGroupId}/members`, {
        method: "POST",
        body: { userId }
      }),
    onSuccess: refreshSelectedGroup
  });

  const updateGroup = useMutation({
    mutationFn: (group: { id: string; name: string; description: string }) =>
      apiRequest(`/groups/${group.id}`, {
        method: "PUT",
        body: {
          name: group.name,
          description: group.description || null
        }
      }),
    onSuccess: async () => {
      closeGroupEditForm();
      await refreshSelectedGroup();
    }
  });

  const archiveGroup = useMutation({
    mutationFn: (groupId: string) =>
      apiRequest(`/groups/${groupId}/archive`, { method: "POST" }),
    onSuccess: async () => {
      setSelectedGroupId(null);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const restoreGroup = useMutation({
    mutationFn: (groupId: string) =>
      apiRequest(`/groups/${groupId}/restore`, { method: "POST" }),
    onSuccess: refreshSelectedGroup
  });

  const deleteGroup = useMutation({
    mutationFn: (groupId: string) =>
      apiRequest(`/groups/${groupId}`, { method: "DELETE" }),
    onSuccess: async () => {
      setSelectedGroupId(null);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const addCategory = useMutation({
    mutationFn: () =>
      apiRequest(`/groups/${selectedGroupId}/categories`, {
        method: "POST",
        body: { name: categoryName, type: categoryType, color: categoryColor }
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
      apiRequest(`/categories/${category.id}`, {
        method: "PUT",
        body: {
          name: category.name,
          type: category.type,
          color: category.color
        }
      }),
    onSuccess: async () => {
      closeCategoryEditForm();
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const archiveCategory = useMutation({
    mutationFn: (categoryId: string) =>
      apiRequest(`/categories/${categoryId}/archive`, { method: "POST" }),
    onSuccess: async () => {
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  const restoreCategory = useMutation({
    mutationFn: (categoryId: string) =>
      apiRequest(`/categories/${categoryId}/restore`, { method: "POST" }),
    onSuccess: refreshSelectedGroup
  });

  const deleteCategory = useMutation({
    mutationFn: (categoryId: string) =>
      apiRequest(`/categories/${categoryId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refreshSelectedGroup();
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  async function refreshSelectedGroup() {
    setUserSearch("");
    await queryClient.invalidateQueries({ queryKey: ["groups"] });
    await queryClient.invalidateQueries({
      queryKey: ["groups", selectedGroupId]
    });
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    await createGroup.mutateAsync();
  }

  async function submitGroupEdit(event: FormEvent) {
    event.preventDefault();
    if (!selectedGroup) return;

    await updateGroup.mutateAsync({
      id: selectedGroup.id,
      name: editGroupName,
      description: editGroupDescription
    });
  }

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

  function closeCreateForm() {
    setName("");
    setDescription("");
    setIsCreateOpen(false);
  }

  function openGroupEditForm(group: Group) {
    setIsEditingGroup(true);
    setEditGroupName(group.name);
    setEditGroupDescription(group.description ?? "");
  }

  function closeGroupEditForm() {
    setIsEditingGroup(false);
    setEditGroupName("");
    setEditGroupDescription("");
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

  async function confirmDeleteGroup(group: Group) {
    const confirmed = window.confirm(
      `Delete "${group.name}" permanently? This cannot be undone. Related transactions, categories, members, and shared financial data may also be deleted or disconnected from this group.`
    );
    if (!confirmed) return;
    await deleteGroup.mutateAsync(group.id);
  }

  async function confirmDeleteCategory(category: Group["categories"][number]) {
    const confirmed = window.confirm(
      `Delete "${category.name}" permanently? This cannot be undone. Related financial data may also be deleted or disconnected from this category.`
    );
    if (!confirmed) return;
    await deleteCategory.mutateAsync(category.id);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_1fr]">
      <div className="grid gap-6 content-start">
        <Card>
          {isCreateOpen ? (
            <>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h2 className="text-lg font-semibold">New group</h2>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={closeCreateForm}
                >
                  Cancel
                </Button>
              </div>
              <form className="mt-4 grid gap-4" onSubmit={submitCreate}>
                <TextInput
                  label="Name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Home, Roommates, Trip group"
                  required
                />
                <TextArea
                  label="Description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <Button type="submit" disabled={createGroup.isPending}>
                  Save group
                </Button>
              </form>
            </>
          ) : (
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => setIsCreateOpen(true)}
            >
              Add group
            </Button>
          )}
        </Card>
        <Card>
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <h2 className="text-lg font-semibold">Groups</h2>
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showArchivedGroups}
                onChange={(event) =>
                  setShowArchivedGroups(event.target.checked)
                }
              />
              Show archived
            </label>
          </div>
          <div className="mt-4 grid gap-3">
            {(groupsQuery.data ?? []).map((group) => (
              <button
                key={group.id}
                type="button"
                className={`rounded-md border p-3 text-left transition ${
                  selectedGroupId === group.id
                    ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                }`}
                onClick={() => {
                  closeCategoryEditForm();
                  setSelectedGroupId(group.id);
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{group.name}</p>
                  {group.isArchived ? (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      Archived
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {group.members.length} members · {group.categories.length}{" "}
                  categories
                </p>
              </button>
            ))}
            {(groupsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No groups yet.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
      <Card>
        {selectedGroup ? (
          <div className="grid gap-6">
            {isEditingGroup ? (
              <form className="grid gap-3" onSubmit={submitGroupEdit}>
                <TextInput
                  label="Name"
                  value={editGroupName}
                  onChange={(event) => setEditGroupName(event.target.value)}
                  required
                />
                <TextArea
                  label="Description"
                  value={editGroupDescription}
                  onChange={(event) =>
                    setEditGroupDescription(event.target.value)
                  }
                />
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button type="submit" disabled={updateGroup.isPending}>
                    Save changes
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={closeGroupEditForm}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">
                      {selectedGroup.name}
                    </h2>
                    {selectedGroup.isArchived ? (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        Archived
                      </span>
                    ) : null}
                  </div>
                  {selectedGroup.description ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {selectedGroup.description}
                    </p>
                  ) : null}
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {canManage ? "Admin" : "Member"}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => openGroupEditForm(selectedGroup)}
                    >
                      Edit
                    </Button>
                    {selectedGroup.isArchived ? (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={restoreGroup.isPending}
                        onClick={() => restoreGroup.mutate(selectedGroup.id)}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={archiveGroup.isPending}
                        onClick={() => archiveGroup.mutate(selectedGroup.id)}
                      >
                        Archive
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="danger"
                      disabled={deleteGroup.isPending}
                      onClick={() => confirmDeleteGroup(selectedGroup)}
                    >
                      Delete
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
            <section>
              <h3 className="font-semibold">Members</h3>
              <div className="mt-3 grid gap-2">
                {selectedGroup.members.map((member) => (
                  <div
                    key={member.id}
                    className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950"
                  >
                    <p className="font-medium">{member.user.name}</p>
                    <p className="text-slate-500 dark:text-slate-400">
                      {member.user.email} · {member.role}
                    </p>
                  </div>
                ))}
              </div>
              {canManageActive ? (
                <div className="mt-4 grid gap-3">
                  <TextInput
                    label="Find app user"
                    value={userSearch}
                    onChange={(event) => setUserSearch(event.target.value)}
                    placeholder="Search by name or email"
                  />
                  {trimmedUserSearch.length > 1 ? (
                    <div className="grid gap-2">
                      {userSearchQuery.isFetching ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          Searching app users...
                        </p>
                      ) : (userSearchQuery.data ?? []).length > 0 ? (
                        (userSearchQuery.data ?? []).map((user) => (
                          <div
                            key={user.id}
                            className="flex flex-col justify-between gap-2 rounded-md border border-slate-200 p-2 text-sm dark:border-slate-800 sm:flex-row sm:items-center"
                          >
                            <div>
                              <p className="font-medium">{user.name}</p>
                              <p className="text-slate-500 dark:text-slate-400">
                                {user.email}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              className="w-full sm:w-auto"
                              disabled={addMember.isPending}
                              onClick={() => addMember.mutate(user.id)}
                            >
                              Add member
                            </Button>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          No app users found.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
            <section>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h3 className="font-semibold">Group categories</h3>
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={showArchivedCategories}
                    onChange={(event) =>
                      setShowArchivedCategories(event.target.checked)
                    }
                  />
                  Show archived
                </label>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {selectedGroup.categories.map((category) => (
                  <div
                    key={category.id}
                    className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800"
                  >
                    {editingCategoryId === category.id ? (
                      <form
                        className="grid gap-3"
                        onSubmit={submitCategoryEdit}
                      >
                        <TextInput
                          label="Name"
                          value={editCategoryName}
                          onChange={(event) =>
                            setEditCategoryName(event.target.value)
                          }
                          required
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <SelectField
                            label="Type"
                            value={editCategoryType}
                            onChange={(event) =>
                              setEditCategoryType(
                                event.target.value as CategoryType
                              )
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
                            value={editCategoryColor}
                            onChange={(event) =>
                              setEditCategoryColor(event.target.value)
                            }
                          />
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Button
                            type="submit"
                            disabled={updateCategory.isPending}
                          >
                            Save changes
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={closeCategoryEditForm}
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
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">
                                {category.name}
                              </p>
                              {category.isArchived ? (
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                  Archived
                                </span>
                              ) : null}
                            </div>
                            <p className="text-slate-500 dark:text-slate-400">
                              {category.type}
                            </p>
                          </div>
                        </div>
                        {canManage ? (
                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button
                              type="button"
                              variant="secondary"
                              className="w-full sm:w-auto"
                              onClick={() => openCategoryEditForm(category)}
                            >
                              Edit
                            </Button>
                            {category.isArchived ? (
                              <Button
                                type="button"
                                variant="secondary"
                                className="w-full sm:w-auto"
                                disabled={restoreCategory.isPending}
                                onClick={() =>
                                  restoreCategory.mutate(category.id)
                                }
                              >
                                Restore
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                className="w-full sm:w-auto"
                                disabled={archiveCategory.isPending}
                                onClick={() =>
                                  archiveCategory.mutate(category.id)
                                }
                              >
                                Archive
                              </Button>
                            )}
                            <Button
                              type="button"
                              variant="danger"
                              className="w-full sm:w-auto"
                              disabled={deleteCategory.isPending}
                              onClick={() => confirmDeleteCategory(category)}
                            >
                              Delete
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {canManageActive ? (
                <form
                  className="mt-4 grid gap-3 md:grid-cols-4"
                  onSubmit={submitCategory}
                >
                  <TextInput
                    label="Category"
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    required
                  />
                  <SelectField
                    label="Type"
                    value={categoryType}
                    onChange={(event) =>
                      setCategoryType(event.target.value as CategoryType)
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
                    value={categoryColor}
                    onChange={(event) => setCategoryColor(event.target.value)}
                  />
                  <div className="flex items-end">
                    <Button type="submit" disabled={addCategory.isPending}>
                      Add category
                    </Button>
                  </div>
                </form>
              ) : null}
            </section>
            <section>
              <h3 className="font-semibold">Recent group transactions</h3>
              <div className="mt-3 grid gap-2">
                {(selectedGroup.transactions ?? []).map((transaction) => (
                  <div
                    key={transaction.id}
                    className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950"
                  >
                    <div className="flex flex-col justify-between gap-1 sm:flex-row">
                      <p className="font-medium">{transaction.name}</p>
                      <p className="font-semibold">
                        {money.format(transaction.amount)}
                      </p>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                      {transaction.groupCategory?.name ?? "No group category"} ·{" "}
                      {new Date(transaction.date).toLocaleDateString()}
                    </p>
                  </div>
                ))}
                {(selectedGroup.transactions ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No group transactions for your account yet.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Select a group to view details.
          </p>
        )}
      </Card>
    </div>
  );
}
