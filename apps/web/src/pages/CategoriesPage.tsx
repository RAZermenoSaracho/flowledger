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

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: async () => (await apiRequest<{ categories: Category[] }>("/categories")).categories
  });

  const createCategory = useMutation({
    mutationFn: () => apiRequest("/categories", { method: "POST", body: { name, type, color } }),
    onSuccess: async () => {
      setName("");
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await createCategory.mutateAsync();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card>
        <h2 className="text-lg font-semibold">New category</h2>
        <form className="mt-4 grid gap-4" onSubmit={submit}>
          <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <SelectField label="Type" value={type} onChange={(event) => setType(event.target.value as CategoryType)}>
            {CATEGORY_TYPES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
          <TextInput label="Color" type="color" value={color} onChange={(event) => setColor(event.target.value)} />
          <Button type="submit" disabled={createCategory.isPending}>
            Save category
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Categories</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(categoriesQuery.data ?? []).map((category) => (
            <div key={category.id} className="flex items-center gap-3 rounded-md border border-slate-200 p-3">
              <span className="h-4 w-4 rounded-full" style={{ background: category.color ?? "#cbd5e1" }} />
              <div>
                <p className="font-semibold">{category.name}</p>
                <p className="text-sm text-slate-500">{category.type}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
