import { ACCOUNT_TYPES } from "@flowledger/shared";
import type { AccountType } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput } from "../components/FormField";
import { apiRequest } from "../services/api";
import type { Account } from "../types/api";

export function AccountsPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("checking");
  const [identifier, setIdentifier] = useState("");
  const [isFormOpen, setIsFormOpen] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: async () =>
      (await apiRequest<{ accounts: Account[] }>("/accounts")).accounts
  });

  const createAccount = useMutation({
    mutationFn: () =>
      apiRequest("/accounts", {
        method: "POST",
        body: { name, type, identifier: identifier || null }
      }),
    onSuccess: async () => {
      setName("");
      setIdentifier("");
      setIsFormOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await createAccount.mutateAsync();
  }

  function closeForm() {
    setName("");
    setType("checking");
    setIdentifier("");
    setIsFormOpen(false);
  }

  return (
    <div className="grid gap-6">
      <Card>
        {isFormOpen ? (
          <>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="text-lg font-semibold">New account</h2>
              <Button
                type="button"
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={closeForm}
              >
                Cancel
              </Button>
            </div>
            <form className="mt-4 grid gap-4 md:grid-cols-3" onSubmit={submit}>
              <TextInput
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
              <SelectField
                label="Type"
                value={type}
                onChange={(event) => setType(event.target.value as AccountType)}
              >
                {ACCOUNT_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item.replace("_", " ")}
                  </option>
                ))}
              </SelectField>
              <TextInput
                label="Identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
              <div className="md:col-span-3">
                <Button type="submit" disabled={createAccount.isPending}>
                  Save account
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
            Add account
          </Button>
        )}
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Accounts</h2>
        <div className="mt-4 grid gap-3">
          {(accountsQuery.data ?? []).map((account) => (
            <div
              key={account.id}
              className="rounded-md border border-slate-200 p-3"
            >
              <p className="font-semibold">{account.name}</p>
              <p className="text-sm capitalize text-slate-500">
                {account.type.replace("_", " ")}
              </p>
              {account.identifier ? (
                <p className="text-sm text-slate-500">{account.identifier}</p>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
