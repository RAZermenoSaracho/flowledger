import { SHARED_EXPENSE_STATUSES } from "@flowledger/shared";
import type { SharedExpenseStatus } from "@flowledger/shared";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { SelectField, TextInput } from "../../../components/FormField";
import { formatMoney } from "../../../utils/currency";
import type { useSharedExpenseForm } from "../hooks/useSharedExpenseForm";

export function SharedExpenseFormCard({
  form
}: {
  form: ReturnType<typeof useSharedExpenseForm>;
}) {
  if (!form.isFormOpen) {
    return (
      <Card>
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => form.setIsFormOpen(true)}
        >
          Add shared expense
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h2 className="text-lg font-semibold">
          {form.editingId ? "Edit shared expense" : "New shared expense"}
        </h2>
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto"
          onClick={form.closeForm}
        >
          Cancel
        </Button>
      </div>
      <form
        className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        onSubmit={form.submit}
      >
        <SelectField
          label="Transaction"
          value={form.transactionId}
          onChange={(event) => form.setTransactionId(event.target.value)}
          required
        >
          <option value="">Select transaction</option>
          {(form.transactionsQuery.data ?? []).map((transaction) => (
            <option key={transaction.id} value={transaction.id}>
              {transaction.name} · {transaction.type} ·{" "}
              {formatMoney(transaction.amount, transaction.executionCurrency)}
            </option>
          ))}
        </SelectField>
        <TextInput
          label="Title"
          value={form.title}
          onChange={(event) => form.setTitle(event.target.value)}
          required
        />
        <div className="grid gap-1">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
            Transaction amount
          </span>
          <p className="rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-200">
            {form.selectedTransaction
              ? formatMoney(
                  form.selectedTransaction.amount,
                  form.selectedTransaction.executionCurrency
                )
              : "Select transaction"}
          </p>
        </div>
        <SelectField
          label="Status"
          value={form.status}
          onChange={(event) =>
            form.setStatus(event.target.value as SharedExpenseStatus)
          }
        >
          {SHARED_EXPENSE_STATUSES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </SelectField>
        <TextInput
          label="Find app user"
          value={form.userSearch}
          onChange={(event) => form.setUserSearch(event.target.value)}
          placeholder="Search by name or email"
        />
        <div className="grid gap-2 md:col-span-2">
          {form.trimmedUserSearch.length > 1 ? (
            form.userSearchQuery.isFetching ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Searching app users...
              </p>
            ) : (form.userSearchQuery.data ?? []).length > 0 ? (
              (form.userSearchQuery.data ?? []).map((user) => (
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
                    onClick={() => form.addUserParticipant(user)}
                  >
                    Add app user
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No app users found.
              </p>
            )
          ) : null}
        </div>
        <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-3 sm:flex-row sm:items-end">
          <TextInput
            label="Manual participant"
            value={form.participantName}
            onChange={(event) => form.setParticipantName(event.target.value)}
            className="sm:min-w-80"
            placeholder="Name for someone without an account"
          />
          <Button
            type="button"
            variant="secondary"
            className="w-full sm:w-auto"
            onClick={form.addManualParticipant}
          >
            Add manual participant
          </Button>
        </div>
        <div className="grid gap-3 md:col-span-2 xl:col-span-3">
          {form.participants.map((participant) => (
            <div
              key={participant.draftId}
              className="grid gap-3 rounded-md border border-slate-200 p-3 dark:border-slate-800 md:grid-cols-2 xl:grid-cols-4"
            >
              <div className="text-sm">
                <p className="font-semibold">{participant.participantName}</p>
                <p className="text-slate-500 dark:text-slate-400">
                  {participant.source === "app"
                    ? `App user${
                        participant.email ? ` · ${participant.email}` : ""
                      }`
                    : "Manual participant"}
                </p>
              </div>
              <TextInput
                label="Share amount"
                type="number"
                step="0.01"
                min="0.01"
                value={participant.shareAmount}
                onChange={(event) =>
                  form.updateParticipant(
                    participant.draftId,
                    "shareAmount",
                    event.target.value
                  )
                }
                required
              />
              <TextInput
                label="Settled amount"
                type="number"
                step="0.01"
                min="0"
                value={participant.paidAmount}
                onChange={(event) =>
                  form.updateParticipant(
                    participant.draftId,
                    "paidAmount",
                    event.target.value
                  )
                }
              />
              <div className="flex items-end">
                <Button
                  type="button"
                  variant="danger"
                  className="w-full"
                  onClick={() => form.removeParticipant(participant.draftId)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {form.participants.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Add an app user or a manual participant to save the split.
            </p>
          ) : null}
        </div>
        <div className="md:col-span-2 xl:col-span-3">
          <Button
            type="submit"
            disabled={form.isSaving || form.participants.length === 0}
          >
            Save split
          </Button>
        </div>
      </form>
    </Card>
  );
}
