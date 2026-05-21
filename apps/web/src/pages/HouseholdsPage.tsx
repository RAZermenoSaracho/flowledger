import { CATEGORY_TYPES } from "@flowledger/shared";
import type { CategoryType } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput, TextArea } from "../components/FormField";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../services/api";
import type { Household, PublicUser } from "../types/api";

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD"
});

export function HouseholdsPage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedHouseholdId, setSelectedHouseholdId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryType, setCategoryType] = useState<CategoryType>("expense");
  const [categoryColor, setCategoryColor] = useState("#176b52");
  const trimmedUserSearch = userSearch.trim();

  const householdsQuery = useQuery({
    queryKey: ["households"],
    queryFn: async () =>
      (await apiRequest<{ households: Household[] }>("/households")).households
  });
  const selectedHouseholdQuery = useQuery({
    queryKey: ["households", selectedHouseholdId],
    enabled: Boolean(selectedHouseholdId),
    queryFn: async () =>
      (
        await apiRequest<{ household: Household }>(
          `/households/${selectedHouseholdId}`
        )
      ).household
  });
  const userSearchQuery = useQuery({
    queryKey: ["users", "search", trimmedUserSearch],
    enabled: Boolean(selectedHouseholdId) && trimmedUserSearch.length > 1,
    queryFn: async () =>
      (
        await apiRequest<{ users: PublicUser[] }>("/users/search", {
          query: { q: trimmedUserSearch, limit: "8" }
        })
      ).users
  });

  const selectedHousehold =
    selectedHouseholdQuery.data ??
    (householdsQuery.data ?? []).find((household) => household.id === selectedHouseholdId);
  const canManage = selectedHousehold?.members.some(
    (member) => member.userId === auth.user?.id && member.role === "admin"
  );

  const createHousehold = useMutation({
    mutationFn: () =>
      apiRequest("/households", {
        method: "POST",
        body: { name, description: description || null }
      }),
    onSuccess: async (response: unknown) => {
      const created = response as { household: Household };
      closeCreateForm();
      setSelectedHouseholdId(created.household.id);
      await queryClient.invalidateQueries({ queryKey: ["households"] });
    }
  });

  const addMember = useMutation({
    mutationFn: (userId: string) =>
      apiRequest(`/households/${selectedHouseholdId}/members`, {
        method: "POST",
        body: { userId }
      }),
    onSuccess: refreshSelectedHousehold
  });

  const addCategory = useMutation({
    mutationFn: () =>
      apiRequest(`/households/${selectedHouseholdId}/categories`, {
        method: "POST",
        body: { name: categoryName, type: categoryType, color: categoryColor }
      }),
    onSuccess: async () => {
      setCategoryName("");
      await refreshSelectedHousehold();
    }
  });

  async function refreshSelectedHousehold() {
    setUserSearch("");
    await queryClient.invalidateQueries({ queryKey: ["households"] });
    await queryClient.invalidateQueries({ queryKey: ["households", selectedHouseholdId] });
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    await createHousehold.mutateAsync();
  }

  async function submitCategory(event: FormEvent) {
    event.preventDefault();
    await addCategory.mutateAsync();
  }

  function closeCreateForm() {
    setName("");
    setDescription("");
    setIsCreateOpen(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,24rem)_1fr]">
      <div className="grid gap-6 content-start">
        <Card>
          {isCreateOpen ? (
            <>
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h2 className="text-lg font-semibold">New household</h2>
                <Button type="button" variant="secondary" onClick={closeCreateForm}>
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
                <Button type="submit" disabled={createHousehold.isPending}>
                  Save household
                </Button>
              </form>
            </>
          ) : (
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => setIsCreateOpen(true)}
            >
              Add household
            </Button>
          )}
        </Card>
        <Card>
          <h2 className="text-lg font-semibold">Households</h2>
          <div className="mt-4 grid gap-3">
            {(householdsQuery.data ?? []).map((household) => (
              <button
                key={household.id}
                type="button"
                className={`rounded-md border p-3 text-left transition ${
                  selectedHouseholdId === household.id
                    ? "border-pine bg-mint dark:border-emerald-500 dark:bg-emerald-950"
                    : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"
                }`}
                onClick={() => setSelectedHouseholdId(household.id)}
              >
                <p className="font-semibold">{household.name}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {household.members.length} members · {household.categories.length} categories
                </p>
              </button>
            ))}
            {(householdsQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No households yet.
              </p>
            ) : null}
          </div>
        </Card>
      </div>
      <Card>
        {selectedHousehold ? (
          <div className="grid gap-6">
            <div className="flex flex-col justify-between gap-2 sm:flex-row">
              <div>
                <h2 className="text-lg font-semibold">{selectedHousehold.name}</h2>
                {selectedHousehold.description ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {selectedHousehold.description}
                  </p>
                ) : null}
              </div>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                {canManage ? "Admin" : "Member"}
              </span>
            </div>
            <section>
              <h3 className="font-semibold">Members</h3>
              <div className="mt-3 grid gap-2">
                {selectedHousehold.members.map((member) => (
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
              {canManage ? (
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
              <h3 className="font-semibold">Household categories</h3>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {selectedHousehold.categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800"
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ background: category.color ?? "#cbd5e1" }}
                    />
                    <div>
                      <p className="font-medium">{category.name}</p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {category.type}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {canManage ? (
                <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={submitCategory}>
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
              <h3 className="font-semibold">Recent household transactions</h3>
              <div className="mt-3 grid gap-2">
                {(selectedHousehold.transactions ?? []).map((transaction) => (
                  <div
                    key={transaction.id}
                    className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950"
                  >
                    <div className="flex flex-col justify-between gap-1 sm:flex-row">
                      <p className="font-medium">{transaction.name}</p>
                      <p className="font-semibold">{money.format(transaction.amount)}</p>
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">
                      {transaction.householdCategory?.name ?? "No household category"} ·{" "}
                      {new Date(transaction.date).toLocaleDateString()}
                    </p>
                  </div>
                ))}
                {(selectedHousehold.transactions ?? []).length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No household transactions for your account yet.
                  </p>
                ) : null}
              </div>
            </section>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Select a household to view details.
          </p>
        )}
      </Card>
    </div>
  );
}
