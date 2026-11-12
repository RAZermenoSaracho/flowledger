import { TRANSACTION_TYPES } from "@flowledger/shared";
import { CurrencySelect } from "../../../components/CurrencySelect";
import { EditableField, editableControlClassName } from "../../../components/EditableField";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { FormDraft } from "../../../types/common.types";
import type { Group } from "../../../types/groups.types";
import type { Transaction } from "../../../types/transactions.types";
import { formatMoney } from "../../../utils/currency";
import { formatTransactionDate, transactionDateNowInputValue } from "../../../utils/dateTime";
import { formatEnumLabel } from "../../../utils/enumLabels";
import type { TransactionDraft } from "../types/transactions.types";
import {
  changeAmount,
  changeType,
  selectAccount,
  selectGroup,
  selectTransferAccount
} from "../utils/transactionDraftReducers";

/**
 * Details tab of the Transaction Form View: every core field as an always-editable control. Every
 * coupling between fields goes through the pure reducers in `transactionDraftReducers` via
 * `draft.update`. `isNew` enables the create-time sharing couplings (a group suggests a split).
 * `transaction` (existing only) adds the read-only amount in the user's preferred currency.
 */
export function TransactionDetailsFields({
  draft,
  isNew,
  transaction,
  accounts,
  categories,
  groups,
  currentUserId,
  preferredCurrency
}: {
  draft: FormDraft<TransactionDraft>;
  isNew: boolean;
  transaction: Transaction | null;
  accounts: Account[];
  categories: Category[];
  groups: Group[];
  currentUserId?: string;
  preferredCurrency?: string | null;
}) {
  const { values } = draft;
  const isTransfer = values.type === "transfer";
  const selectedGroup = groups.find((group) => group.id === values.groupId);
  const categoryOptions = values.groupId ? (selectedGroup?.categories ?? []) : categories;

  function field(key: keyof TransactionDraft) {
    return {
      error: draft.fieldErrors[key],
      dirty: draft.changedKeys.includes(key),
      onRevert: () => draft.revertField(key)
    };
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <EditableField label="Name" {...field("name")}>
        <input
          className={editableControlClassName}
          value={values.name}
          onChange={(event) => draft.setField("name", event.target.value)}
        />
      </EditableField>
      <EditableField label="Amount" {...field("amount")}>
        <input
          className={editableControlClassName}
          type="number"
          step="0.01"
          value={values.amount}
          onChange={(event) => {
            const amount = event.target.value;
            draft.update((current) =>
              changeAmount(current, amount, { group: selectedGroup, currentUserId, sharing: isNew })
            );
          }}
        />
      </EditableField>
      {transaction && preferredCurrency && preferredCurrency !== transaction.executionCurrency ? (
        <EditableField
          label="Amount in your currency"
          readOnly
          display={formatMoney(transaction.amountInPreferredCurrency, preferredCurrency)}
        >
          {null}
        </EditableField>
      ) : null}
      <EditableField label={isTransfer ? "From account" : "Account"} {...field("accountId")}>
        <select
          className={editableControlClassName}
          value={values.accountId}
          onChange={(event) =>
            draft.update((current) => selectAccount(current, event.target.value, accounts))
          }
        >
          <option value="">{isTransfer ? "Select account" : "None"}</option>
          {accounts
            .filter((account) => !isTransfer || account.id !== values.transferToAccountId)
            .map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
        </select>
      </EditableField>
      <EditableField label="Currency" hideLabel {...field("executionCurrency")}>
        <CurrencySelect
          label="Currency"
          value={values.executionCurrency}
          onChange={(value) => draft.setField("executionCurrency", value)}
          disabled={draft.isSaving}
        />
      </EditableField>
      <EditableField label="Type" {...field("type")}>
        <select
          className={editableControlClassName}
          value={values.type}
          onChange={(event) =>
            draft.update((current) =>
              changeType(current, event.target.value as TransactionDraft["type"], categoryOptions)
            )
          }
        >
          {TRANSACTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {formatEnumLabel(type)}
            </option>
          ))}
        </select>
      </EditableField>
      <div className="relative">
        <EditableField label="Date and time" {...field("date")}>
          <input
            className={`${editableControlClassName} box-border max-w-full appearance-none`}
            type="datetime-local"
            value={values.date}
            onChange={(event) => draft.setField("date", event.target.value)}
          />
        </EditableField>
        {/* The native picker's own reset control is browser-rendered and unreliable on some mobile browsers. */}
        <button
          type="button"
          onClick={() => draft.setField("date", transactionDateNowInputValue())}
          className="absolute right-0 top-0 text-xs font-semibold text-pine hover:underline dark:text-emerald-300"
        >
          Reset to now
        </button>
      </div>
      {isTransfer ? (
        <EditableField label="To account" {...field("transferToAccountId")}>
          <select
            className={editableControlClassName}
            value={values.transferToAccountId}
            onChange={(event) =>
              draft.update((current) => selectTransferAccount(current, event.target.value))
            }
          >
            <option value="">Select account</option>
            {accounts
              .filter((account) => account.id !== values.accountId)
              .map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
          </select>
        </EditableField>
      ) : (
        <>
          <EditableField label="Category" {...field("categoryId")}>
            <select
              className={editableControlClassName}
              value={values.categoryId}
              onChange={(event) => draft.setField("categoryId", event.target.value)}
            >
              <option value="">None</option>
              {categoryOptions
                .filter((category) => category.type === values.type)
                .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
            </select>
          </EditableField>
          <EditableField label="Group" {...field("groupId")}>
            <select
              className={editableControlClassName}
              value={values.groupId}
              onChange={(event) =>
                draft.update((current) =>
                  selectGroup(
                    current,
                    groups.find((group) => group.id === event.target.value),
                    { currentUserId, sharing: isNew }
                  )
                )
              }
            >
              <option value="">None</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </EditableField>
        </>
      )}
      {transaction?.providerImportedTransaction ? (
        <EditableField
          label="Imported from provider"
          readOnly
          display={formatTransactionDate({ date: transaction.providerImportedTransaction.transactionDate })}
        >
          {null}
        </EditableField>
      ) : null}
      <div className="sm:col-span-2 xl:col-span-3">
        <EditableField label="Notes" {...field("notes")}>
          <textarea
            className={`${editableControlClassName} min-h-24`}
            value={values.notes}
            onChange={(event) => draft.setField("notes", event.target.value)}
          />
        </EditableField>
        {isTransfer ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Transfers move money between your own accounts, so they cannot be shared or split.
          </p>
        ) : null}
      </div>
    </div>
  );
}
