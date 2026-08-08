import type { FormEvent } from "react";
import { Card } from "../../../components/Card";
import { SearchComponent } from "../../../components/SearchComponent";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { Debt, PersonBalance } from "../../../types/debts.types";
import { formatMoney } from "../../../utils/currency";
import type { SettlementDraft } from "../types/debts.types";
import { displayPerson } from "../utils/debtDisplay";
import { EmptyState } from "./EmptyState";
import { PersonDebtDetail } from "./PersonDebtDetail";

/** Tab listing net balances per person, expandable into per-person debt detail. */
export function BalancesTab({
  balances,
  visibleBalances,
  balanceSearch,
  onBalanceSearchChange,
  selectedBalance,
  onSelectPerson,
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
  balances: PersonBalance[];
  visibleBalances: PersonBalance[];
  balanceSearch: string;
  onBalanceSearchChange: (value: string) => void;
  selectedBalance: PersonBalance | null | undefined;
  onSelectPerson: (key: string) => void;
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
  return (
    <div className="grid gap-4">
      <Card>
        <div className="flex flex-col justify-between gap-1 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-lg font-semibold">Outstanding balances</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              One net balance per person across all unsettled debts, converted
              to {summaryCurrency}. Individual debts stay denominated in their
              original currency.
            </p>
          </div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {visibleBalances.length} of {balances.length}
          </p>
        </div>
        <div className="mt-4">
          <SearchComponent
            searchValue={balanceSearch}
            searchPlaceholder="Search people or debts"
            onSearchChange={onBalanceSearchChange}
          />
        </div>
        <div className="mt-4 overflow-x-auto">
          {balances.length === 0 ? (
            <EmptyState>No outstanding balances.</EmptyState>
          ) : visibleBalances.length === 0 ? (
            <EmptyState>No balances match your search.</EmptyState>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <tr>
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  <th className="px-3 py-2 text-right font-semibold">
                    They owe me
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">
                    I owe them
                  </th>
                  <th className="px-3 py-2 text-right font-semibold">Net</th>
                  <th className="py-2 pl-3 font-semibold">Records</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visibleBalances.map((balance) => {
                  const isSelected = selectedBalance?.key === balance.key;
                  return (
                    <tr
                      key={balance.key}
                      className={`cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800 ${
                        isSelected ? "bg-mint dark:bg-emerald-950" : ""
                      }`}
                      onClick={() => onSelectPerson(balance.key)}
                    >
                      <td className="py-3 pr-3">
                        <p className="font-semibold">
                          {displayPerson(balance)}
                        </p>
                        {balance.person?.email ? (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {balance.person.email}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {formatMoney(balance.theyOweMeTotal, summaryCurrency)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {formatMoney(balance.iOweThemTotal, summaryCurrency)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right font-semibold ${
                          balance.netBalance >= 0
                            ? "text-pine dark:text-emerald-400"
                            : "text-coral dark:text-red-400"
                        }`}
                      >
                        {formatMoney(balance.netBalance, summaryCurrency)}
                      </td>
                      <td className="py-3 pl-3 text-slate-500 dark:text-slate-400">
                        {balance.theyOweMe.length + balance.iOweThem.length}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {selectedBalance ? (
        <PersonDebtDetail
          balance={selectedBalance}
          summaryCurrency={summaryCurrency}
          viewerUserId={viewerUserId}
          selectedDebtIds={selectedDebtIds}
          selectedIOweThem={selectedIOweThem}
          accounts={accounts}
          isActing={isActing}
          highlightedDebtId={highlightedDebtId}
          draftFor={draftFor}
          isSettlementDraftComplete={isSettlementDraftComplete}
          updateDraft={updateDraft}
          categoryOptionsFor={categoryOptionsFor}
          onToggleDebt={onToggleDebt}
          onSelectDebts={onSelectDebts}
          onSubmitSettlement={onSubmitSettlement}
          onSubmitBatchSettlement={onSubmitBatchSettlement}
        />
      ) : null}
    </div>
  );
}
