import type { FormEvent } from "react";
import { Button } from "../../../components/Button";
import { SelectField } from "../../../components/FormField";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { SettlementRequest } from "../../../types/debts.types";
import type { SettlementApprovalDraft } from "../types/debts.types";

export function ApprovalActions({
  request,
  accounts,
  incomeCategories,
  expenseOffsetCategories,
  draft,
  isActing,
  onDraftChange,
  onApprove,
  onReject
}: {
  request: SettlementRequest;
  accounts: Account[];
  incomeCategories: Category[];
  expenseOffsetCategories: Category[];
  draft: SettlementApprovalDraft;
  isActing: boolean;
  onDraftChange: (field: keyof SettlementApprovalDraft, value: string) => void;
  onApprove: (event: FormEvent) => void;
  onReject: () => void;
}) {
  const originalType =
    request.sharedExpenseParticipant?.sharedExpense.transaction?.type;

  return (
    <form className="grid w-full max-w-md gap-3" onSubmit={onApprove}>
      <SelectField
        label="Deposit account"
        value={draft.accountId}
        onChange={(event) => onDraftChange("accountId", event.target.value)}
        required
      >
        <option value="">Select account</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Income category"
        value={draft.categoryId}
        onChange={(event) => onDraftChange("categoryId", event.target.value)}
        required
      >
        <option value="">Select category</option>
        {incomeCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Offset category"
        value={draft.expenseOffsetCategoryId}
        onChange={(event) =>
          onDraftChange("expenseOffsetCategoryId", event.target.value)
        }
        disabled={originalType !== "expense"}
      >
        <option value="">No offset</option>
        {expenseOffsetCategories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          type="submit"
          className="w-full"
          disabled={isActing || !draft.accountId || !draft.categoryId}
        >
          Approve
        </Button>
        <Button
          type="button"
          variant="danger"
          className="w-full"
          disabled={isActing}
          onClick={onReject}
        >
          Reject
        </Button>
      </div>
    </form>
  );
}
