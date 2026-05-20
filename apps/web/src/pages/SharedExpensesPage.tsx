import { SHARED_EXPENSE_STATUSES } from "@flowledger/shared";
import type { SharedExpenseStatus } from "@flowledger/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { SelectField, TextInput } from "../components/FormField";
import { apiRequest } from "../services/api";
import type { SharedExpense, Transaction } from "../types/api";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function SharedExpensesPage() {
  const queryClient = useQueryClient();
  const [transactionId, setTransactionId] = useState("");
  const [title, setTitle] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [status, setStatus] = useState<SharedExpenseStatus>("open");
  const [participantName, setParticipantName] = useState("");
  const [shareAmount, setShareAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("0");

  const transactionsQuery = useQuery({
    queryKey: ["transactions", "shared-options"],
    queryFn: async () => (await apiRequest<{ transactions: Transaction[] }>("/transactions")).transactions
  });
  const sharedExpensesQuery = useQuery({
    queryKey: ["shared-expenses"],
    queryFn: async () => (await apiRequest<{ sharedExpenses: SharedExpense[] }>("/shared-expenses")).sharedExpenses
  });

  const createSharedExpense = useMutation({
    mutationFn: () =>
      apiRequest("/shared-expenses", {
        method: "POST",
        body: {
          transactionId,
          title,
          totalAmount: Number(totalAmount),
          status,
          participants: [
            {
              participantName,
              shareAmount: Number(shareAmount),
              paidAmount: Number(paidAmount),
              status: Number(paidAmount) >= Number(shareAmount) ? "paid" : Number(paidAmount) > 0 ? "partial" : "pending"
            }
          ]
        }
      }),
    onSuccess: async () => {
      setTitle("");
      setTotalAmount("");
      setParticipantName("");
      setShareAmount("");
      setPaidAmount("0");
      await queryClient.invalidateQueries({ queryKey: ["shared-expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
    }
  });

  async function submit(event: FormEvent) {
    event.preventDefault();
    await createSharedExpense.mutateAsync();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
      <Card>
        <h2 className="text-lg font-semibold">New shared expense</h2>
        <form className="mt-4 grid gap-4" onSubmit={submit}>
          <SelectField label="Transaction" value={transactionId} onChange={(event) => setTransactionId(event.target.value)} required>
            <option value="">Select transaction</option>
            {(transactionsQuery.data ?? []).map((transaction) => (
              <option key={transaction.id} value={transaction.id}>
                {transaction.name} · {money.format(transaction.amount)}
              </option>
            ))}
          </SelectField>
          <TextInput label="Title" value={title} onChange={(event) => setTitle(event.target.value)} required />
          <TextInput
            label="Total amount"
            type="number"
            step="0.01"
            value={totalAmount}
            onChange={(event) => setTotalAmount(event.target.value)}
            required
          />
          <SelectField label="Status" value={status} onChange={(event) => setStatus(event.target.value as SharedExpenseStatus)}>
            {SHARED_EXPENSE_STATUSES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </SelectField>
          <TextInput
            label="Participant"
            value={participantName}
            onChange={(event) => setParticipantName(event.target.value)}
            required
          />
          <TextInput
            label="Share amount"
            type="number"
            step="0.01"
            value={shareAmount}
            onChange={(event) => setShareAmount(event.target.value)}
            required
          />
          <TextInput
            label="Paid amount"
            type="number"
            step="0.01"
            value={paidAmount}
            onChange={(event) => setPaidAmount(event.target.value)}
          />
          <Button type="submit" disabled={createSharedExpense.isPending}>
            Save split
          </Button>
        </form>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Shared expenses</h2>
        <div className="mt-4 grid gap-3">
          {(sharedExpensesQuery.data ?? []).map((sharedExpense) => (
            <div key={sharedExpense.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex flex-col justify-between gap-2 sm:flex-row">
                <div>
                  <p className="font-semibold">{sharedExpense.title}</p>
                  <p className="text-sm text-slate-500">{sharedExpense.status}</p>
                </div>
                <p className="font-semibold">{money.format(sharedExpense.totalAmount)}</p>
              </div>
              <div className="mt-3 grid gap-2">
                {sharedExpense.participants.map((participant) => (
                  <div key={participant.id} className="rounded-md bg-slate-50 p-2 text-sm">
                    {participant.participantName}: {money.format(participant.paidAmount)} paid of {money.format(participant.shareAmount)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
