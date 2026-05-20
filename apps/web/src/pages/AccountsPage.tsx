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

  const accountsQuery = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => (await apiRequest<{ accounts: Account[] }>("/accounts")).accounts
  });

  const createAccount = useMutation({
    mutationFn: () => apiRequest("/accounts", { method: "POST", body: { name, type, identifier: identifier || null } }),
    onSuccess: async () => {
      setName("");
      setIdentifier("");
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await createAccount.mutateAsync();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card>
        <h2 className="text-lg font-semibold">New account</h2>
        <form className="mt-4 grid gap-4" onSubmit={submit}>
          <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} required />
          <SelectField label="Type" value={type} onChange={(event) => setType(event.target.value as AccountType)}>
            {ACCOUNT_TYPES.map((item) => (
              <option key={item} value={item}>
                {item.replace("_", " ")}
              </option>
            ))}
          </SelectField>
          <TextInput label="Identifier" value={identifier} onChange={(event) => setIdentifier(event.target.value)} />
          <Button type="submit" disabled={createAccount.isPending}>
            Save account
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Accounts</h2>
        <div className="mt-4 grid gap-3">
          {(accountsQuery.data ?? []).map((account) => (
            <div key={account.id} className="rounded-md border border-slate-200 p-3">
              <p className="font-semibold">{account.name}</p>
              <p className="text-sm capitalize text-slate-500">{account.type.replace("_", " ")}</p>
              {account.identifier ? <p className="text-sm text-slate-500">{account.identifier}</p> : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
