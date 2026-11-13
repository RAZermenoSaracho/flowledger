import { SHARED_EXPENSE_STATUSES } from "@flowledger/shared";
import {
  EditableField,
  editableControlClassName
} from "../../../components/EditableField";
import type { FormDraft } from "../../../types/common.types";
import type { SharedExpense } from "../../../types/sharedExpenses.types";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate } from "../../../utils/dateTime";
import { formatEnumLabel } from "../../../utils/enumLabels";
import { formatPublicUser } from "../../../utils/publicUser";
import type { SharedExpenseDraft } from "../types/sharedExpenses.types";
import { splitDirectionLabel } from "../utils/sharedExpenseDisplay";

/** General tab of the Shared Expense Form View: title and status (read-only unless `readOnly` is false), then the facts the owner changes on the transaction instead. */
export function SharedExpenseGeneralTab({
  sharedExpense,
  draft,
  readOnly,
  currentUserId
}: {
  sharedExpense: SharedExpense;
  draft: FormDraft<SharedExpenseDraft>;
  readOnly: boolean;
  currentUserId: string | undefined;
}) {
  const { transaction } = sharedExpense;
  const facts: [string, string][] = [
    ["Transaction", transaction?.name ?? "-"],
    [
      "Amount",
      formatMoney(sharedExpense.totalAmount, transaction?.executionCurrency ?? "USD")
    ],
    ["Date", transaction ? formatTransactionDate(transaction) : "-"],
    ["Owner", sharedExpense.owner ? formatPublicUser(sharedExpense.owner) : "-"],
    ["Direction", splitDirectionLabel(sharedExpense, currentUserId)]
  ];

  function field(key: keyof SharedExpenseDraft) {
    return {
      error: draft.fieldErrors[key],
      dirty: draft.changedKeys.includes(key),
      onRevert: () => draft.revertField(key),
      readOnly
    };
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <EditableField label="Title" {...field("title")}>
        <input
          className={editableControlClassName}
          value={draft.values.title ?? ""}
          onChange={(event) => draft.setField("title", event.target.value)}
        />
      </EditableField>
      <EditableField
        label="Status"
        display={formatEnumLabel(draft.values.status ?? sharedExpense.status)}
        {...field("status")}
      >
        <select
          className={editableControlClassName}
          value={draft.values.status ?? sharedExpense.status}
          onChange={(event) =>
            draft.setField("status", event.target.value as SharedExpenseDraft["status"])
          }
        >
          {SHARED_EXPENSE_STATUSES.map((status) => (
            <option key={status} value={status}>
              {formatEnumLabel(status)}
            </option>
          ))}
        </select>
      </EditableField>
      {facts.map(([label, value]) => (
        <div key={label}>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="min-h-10 px-2 py-2 text-base sm:text-sm">{value}</p>
        </div>
      ))}
    </div>
  );
}
