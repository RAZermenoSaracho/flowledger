import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { apiRequest } from "../services/api";
import type { Transaction } from "../types/api";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function splitDirectionLabel(type: Transaction["type"]) {
  if (type === "income") return "You owe participants";
  if (type === "expense") return "Participants owe you";
  return "No debt direction";
}

export function TransactionDetailPage() {
  const { id } = useParams();
  const transactionQuery = useQuery({
    queryKey: ["transaction", id],
    enabled: Boolean(id),
    queryFn: async () => (await apiRequest<{ transaction: Transaction }>(`/transactions/${id}`)).transaction
  });

  const transaction = transactionQuery.data;

  if (!transaction) {
    return <Card>Loading transaction...</Card>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <Link className="text-sm font-semibold text-pine dark:text-emerald-300" to="/transactions">
          Back to transactions
        </Link>
        <h2 className="mt-4 text-2xl font-bold">{transaction.name}</h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <Detail label="Amount" value={money.format(transaction.amount)} />
          <Detail label="Type" value={transaction.type} />
          <Detail label="Date" value={new Date(transaction.date).toLocaleDateString()} />
          <Detail label="Account" value={transaction.account?.name ?? "No account"} />
          <Detail label="Category" value={transaction.category?.name ?? "Uncategorized"} />
          <Detail label="Notes" value={transaction.notes ?? "No notes"} />
        </dl>
      </Card>
      <Card>
        <h3 className="text-lg font-semibold">Shared expense</h3>
        {transaction.sharedExpense ? (
          <div className="mt-4 grid gap-3">
            <p className="font-semibold">{transaction.sharedExpense.title}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {transaction.sharedExpense.status} · {splitDirectionLabel(transaction.type)}
            </p>
            {transaction.sharedExpense.participants.map((participant) => (
              <div key={participant.id} className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950">
                <p className="font-medium">{participant.participantName}</p>
                <p>
                  {money.format(participant.paidAmount)} settled of {money.format(participant.shareAmount)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">No shared expense is attached.</p>
        )}
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
