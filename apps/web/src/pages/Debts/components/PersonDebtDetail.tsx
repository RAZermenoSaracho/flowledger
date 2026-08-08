import type { FormEvent } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { SelectField, TextInput } from "../../../components/FormField";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { Debt, PersonBalance } from "../../../types/debts.types";
import { formatMoney } from "../../../utils/currency";
import type { SettlementDraft } from "../types/debts.types";
import { availableSettlementAmount, displayPerson } from "../utils/debtDisplay";
import { DebtTable } from "./DebtTable";
import { EmptyState } from "./EmptyState";

/** Expanded per-person debt breakdown with settlement request form. */
export function PersonDebtDetail({
  balance,
  summaryCurrency,
  viewerUserId,
  selectedDebtIds,
  selectedIOweThem,
  accounts,
  isActing,
  highlightedDebtId,
  draftFor,
  isSettlementDraftComplete,
  updateDraft,
  categoryOptionsFor,
  onToggleDebt,
  onSelectDebts,
  onSubmitSettlement,
  onSubmitBatchSettlement
}: {
  balance: PersonBalance;
  summaryCurrency: string;
  viewerUserId?: string;
  selectedDebtIds: Set<string>;
  selectedIOweThem: Debt[];
  accounts: Account[];
  isActing: boolean;
  highlightedDebtId?: string | null;
  draftFor: (debt: Debt) => SettlementDraft;
  isSettlementDraftComplete: (debt: Debt) => boolean;
  updateDraft: (
    debt: Debt,
    field: keyof SettlementDraft,
    value: string
  ) => void;
  categoryOptionsFor: (debt: Debt) => Category[];
  onToggleDebt: (debtId: string) => void;
  onSelectDebts: (debts: Debt[], selected: boolean) => void;
  onSubmitSettlement: (event: FormEvent, debt: Debt) => Promise<void>;
  onSubmitBatchSettlement: (event: FormEvent) => Promise<void>;
}) {
  const selectableIOweThem = balance.iOweThem.filter(
    (debt) => availableSettlementAmount(debt) > 0
  );
  const selectedBatchTotal = selectedIOweThem.reduce(
    (total, debt) => total + (Number(draftFor(debt).amount) || 0),
    0
  );
  const selectedDraftsComplete =
    selectedIOweThem.length > 0 &&
    selectedIOweThem.every(isSettlementDraftComplete);
  const batchValidationMessage =
    selectedIOweThem.length > 0 && !selectedDraftsComplete
      ? "Complete amount, account, and category for every selected debt before requesting settlement."
      : "";

  return (
    <Card>
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-start">
        <div>
          <h2 className="text-lg font-semibold">{displayPerson(balance)}</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Net balance {formatMoney(balance.netBalance, summaryCurrency)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-sm sm:text-right">
          <div>
            <p className="font-semibold">
              {formatMoney(balance.theyOweMeTotal, summaryCurrency)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              They owe me
            </p>
          </div>
          <div>
            <p className="font-semibold">
              {formatMoney(balance.iOweThemTotal, summaryCurrency)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              I owe them
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-5">
        <DebtTable
          title="They Owe Me"
          debts={balance.theyOweMe}
          viewerUserId={viewerUserId}
          selectedDebtIds={selectedDebtIds}
          highlightedDebtId={highlightedDebtId}
          emptyText="This person does not owe you on any open debt records."
          onToggleDebt={onToggleDebt}
          onSelectDebts={onSelectDebts}
        />

        <div className="grid gap-3">
          <div className="flex flex-col justify-between gap-2 lg:flex-row lg:items-end">
            <div>
              <h3 className="text-sm font-semibold uppercase text-slate-500 dark:text-slate-400">
                Batch settlement
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {selectedIOweThem.length} selected ·{" "}
                {formatMoney(selectedBatchTotal, summaryCurrency)}
              </p>
            </div>
            <form
              className="grid gap-2 sm:grid-cols-3"
              onSubmit={onSubmitBatchSettlement}
            >
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={selectableIOweThem.length === 0}
                onClick={() => onSelectDebts(selectableIOweThem, true)}
              >
                Select All
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={selectedIOweThem.length === 0}
                onClick={() => onSelectDebts(selectableIOweThem, false)}
              >
                Clear Selection
              </Button>
              <Button
                type="submit"
                className="w-full"
                disabled={isActing || !selectedDraftsComplete}
              >
                Request Selected
              </Button>
              {batchValidationMessage ? (
                <p className="text-sm text-coral dark:text-red-400 sm:col-span-3">
                  {batchValidationMessage}
                </p>
              ) : null}
            </form>
          </div>

          <DebtTable
            title="I Owe Them"
            debts={balance.iOweThem}
            viewerUserId={viewerUserId}
            selectedDebtIds={selectedDebtIds}
            highlightedDebtId={highlightedDebtId}
            emptyText="You do not owe this person on any open debt records."
            selectableDebts={selectableIOweThem}
            onToggleDebt={onToggleDebt}
            onSelectDebts={onSelectDebts}
            renderAction={(debt) => {
              const draft = draftFor(debt);
              const availableAmount = availableSettlementAmount(debt);
              const settlementCategoryOptions = categoryOptionsFor(debt);

              return availableAmount <= 0 ? (
                <EmptyState>
                  A settlement request is waiting for approval.
                </EmptyState>
              ) : (
                <form
                  className="grid min-w-0 gap-2"
                  onSubmit={(event) => onSubmitSettlement(event, debt)}
                >
                  <TextInput
                    label={`Amount (${debt.currency})`}
                    type="number"
                    min="0.01"
                    max={availableAmount}
                    step="0.01"
                    value={draft.amount}
                    onChange={(event) =>
                      updateDraft(debt, "amount", event.target.value)
                    }
                    required
                  />
                  <SelectField
                    label="Account"
                    value={draft.accountId}
                    onChange={(event) =>
                      updateDraft(debt, "accountId", event.target.value)
                    }
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
                    label="Category"
                    value={draft.categoryId}
                    onChange={(event) =>
                      updateDraft(debt, "categoryId", event.target.value)
                    }
                    required
                  >
                    <option value="">Select category</option>
                    {settlementCategoryOptions.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </SelectField>
                  <div className="flex items-end">
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={isActing}
                    >
                      Request settlement
                    </Button>
                  </div>
                </form>
              );
            }}
          />
        </div>
      </div>
    </Card>
  );
}
