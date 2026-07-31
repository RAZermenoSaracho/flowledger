import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { useAuth } from "../hooks/useAuth";
import { apiRequest } from "../services/api";
import { formatMoney } from "../utils/currency";
import type { Transaction } from "../types/api";

function splitDirectionLabel(type: Transaction["type"]) {
  if (type === "income") return "You owe participants";
  if (type === "expense") return "Participants owe you";
  return "No debt direction";
}

function needsClassification(transaction: Transaction) {
  if (transaction.type === "transfer") {
    return !transaction.accountId || !transaction.transferToAccountId;
  }

  return !transaction.accountId || !transaction.categoryId;
}

function transferDirection(transaction: Transaction) {
  return `${transaction.account?.name ?? "No from account"} -> ${
    transaction.transferToAccount?.name ?? "No to account"
  }`;
}

export function TransactionDetailPage() {
  const auth = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const transactionQuery = useQuery({
    queryKey: ["transaction", id],
    enabled: Boolean(id),
    queryFn: async () =>
      (await apiRequest<{ transaction: Transaction }>(`/transactions/${id}`))
        .transaction
  });
  const deleteTransaction = useMutation({
    mutationFn: (transactionId: string) =>
      apiRequest(`/transactions/${transactionId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["summary"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["shared-expenses"] });
      await queryClient.invalidateQueries({ queryKey: ["debts"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
      navigate("/transactions");
    }
  });

  const transaction = transactionQuery.data;

  if (!transaction) {
    return <Card>Loading transaction...</Card>;
  }

  const isPendingClassification = needsClassification(transaction);

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            className="text-sm font-semibold text-pine dark:text-emerald-300"
            to="/transactions"
          >
            Back to transactions
          </Link>
          <Button
            type="button"
            variant="danger"
            disabled={deleteTransaction.isPending}
            onClick={() => {
              const sharedCleanup = transaction.sharedExpense
                ? " This transaction has a shared expense, so participants, debts, settlements, and related notifications will also be removed."
                : "";
              const confirmed = window.confirm(
                `Delete "${transaction.name}" permanently?${sharedCleanup}`
              );
              if (confirmed) void deleteTransaction.mutateAsync(transaction.id);
            }}
          >
            Delete
          </Button>
        </div>
        <h2 className="mt-4 text-2xl font-bold">{transaction.name}</h2>
        {isPendingClassification ? (
          <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
            {transaction.type === "transfer"
              ? "Pending classification: add from and to accounts."
              : "Pending classification: add a category and account."}
          </p>
        ) : null}
        <dl className="mt-6 grid gap-4 sm:grid-cols-2">
          <Detail
            label="Amount"
            value={formatMoney(transaction.amount, transaction.executionCurrency)}
          />
          {auth.user?.preferredCurrency &&
          auth.user.preferredCurrency !== transaction.executionCurrency ? (
            <Detail
              label="Amount in your currency"
              value={formatMoney(
                transaction.amountInPreferredCurrency,
                auth.user.preferredCurrency
              )}
            />
          ) : null}
          <Detail label="Type" value={transaction.type} />
          <Detail
            label="Date"
            value={new Date(transaction.date).toLocaleDateString()}
          />
          <Detail
            label={transaction.type === "transfer" ? "From account" : "Account"}
            value={
              transaction.type === "transfer"
                ? (transaction.account?.name ?? "No from account")
                : (transaction.account?.name ?? "No account")
            }
          />
          {transaction.type === "transfer" ? (
            <>
              <Detail
                label="To account"
                value={transaction.transferToAccount?.name ?? "No to account"}
              />
              <Detail
                label="Direction"
                value={transferDirection(transaction)}
              />
            </>
          ) : (
            <>
              <Detail
                label="Category"
                value={transaction.category?.name ?? "Uncategorized"}
              />
              <Detail
                label="Group"
                value={transaction.group?.name ?? "No group"}
              />
              <Detail
                label="Group category"
                value={transaction.category?.name ?? "No group category"}
              />
            </>
          )}
          <Detail label="Notes" value={transaction.notes ?? "No notes"} />
        </dl>
      </Card>
      <Card>
        <h3 className="text-lg font-semibold">Shared expense</h3>
        {transaction.sharedExpense ? (
          <div className="mt-4 grid gap-3">
            <p className="font-semibold">{transaction.sharedExpense.title}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {transaction.sharedExpense.status} ·{" "}
              {splitDirectionLabel(transaction.type)}
            </p>
            {transaction.sharedExpense.participants.map((participant) => (
              <div
                key={participant.id}
                className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-950"
              >
                <p className="font-medium">{participant.participantName}</p>
                <p>
                  {formatMoney(participant.paidAmount, participant.currency)}{" "}
                  settled of{" "}
                  {formatMoney(participant.shareAmount, participant.currency)}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            No shared expense is attached.
          </p>
        )}
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
        {label}
      </dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
