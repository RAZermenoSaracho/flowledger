import { TRANSACTION_TYPES } from "@flowledger/shared";
import { CurrencySelect } from "../../../components/CurrencySelect";
import {
  SelectField,
  TextArea,
  TextInput
} from "../../../components/FormField";
import type { Account } from "../../../types/accounts.types";
import type { Category } from "../../../types/categories.types";
import type { Group } from "../../../types/groups.types";
import type { TransactionFormState } from "../types/transactions.types";

const TRANSFER_ACCOUNT_VALIDATION_MESSAGE =
  "Source and destination accounts must be different";

export function TransactionCoreFields({
  form,
  onFormChange,
  onSwitchedToTransfer,
  onGroupSelected,
  accounts,
  groups,
  categoryOptions
}: {
  form: TransactionFormState;
  onFormChange: (form: TransactionFormState) => void;
  onSwitchedToTransfer: () => void;
  onGroupSelected: (group: Group) => void;
  accounts: Account[];
  groups: Group[];
  categoryOptions: Category[];
}) {
  const transferAccountsMatch =
    form.type === "transfer" &&
    Boolean(
      form.accountId &&
      form.transferToAccountId &&
      form.accountId === form.transferToAccountId
    );
  const sourceAccountOptions = accounts.filter(
    (account) => account.id !== form.transferToAccountId
  );
  const destinationAccountOptions = accounts.filter(
    (account) => account.id !== form.accountId
  );

  return (
    <>
      <TextInput
        label="Name"
        value={form.name}
        onChange={(event) =>
          onFormChange({ ...form, name: event.target.value })
        }
        required
      />
      <TextInput
        label="Amount"
        type="number"
        step="0.01"
        value={form.amount}
        onChange={(event) =>
          onFormChange({ ...form, amount: event.target.value })
        }
        required
      />
      <SelectField
        label={form.type === "transfer" ? "From account" : "Account"}
        value={form.accountId}
        onChange={(event) => {
          const accountId = event.target.value;
          const selectedAccount = accounts.find(
            (account) => account.id === accountId
          );
          onFormChange({
            ...form,
            accountId,
            executionCurrency:
              selectedAccount?.currency ?? form.executionCurrency,
            transferToAccountId:
              accountId && accountId === form.transferToAccountId
                ? ""
                : form.transferToAccountId
          });
        }}
        required={form.type === "transfer"}
      >
        <option value="">
          {form.type === "transfer" ? "Select account" : "None"}
        </option>
        {(form.type === "transfer" ? sourceAccountOptions : accounts).map(
          (account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          )
        )}
      </SelectField>
      <CurrencySelect
        label="Currency"
        value={form.executionCurrency}
        onChange={(executionCurrency) =>
          onFormChange({ ...form, executionCurrency })
        }
      />
      <SelectField
        label="Type"
        value={form.type}
        onChange={(event) => {
          const type = event.target.value as typeof form.type;
          onFormChange({
            ...form,
            type,
            ...(type === "transfer"
              ? {
                  categoryId: "",
                  groupId: "",
                  isShared: false,
                  sharedTitle: "",
                  transferToAccountId:
                    form.accountId === form.transferToAccountId
                      ? ""
                      : form.transferToAccountId
                }
              : {})
          });
          if (type === "transfer") {
            onSwitchedToTransfer();
          }
        }}
      >
        {TRANSACTION_TYPES.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </SelectField>
      <TextInput
        label="Date"
        type="date"
        value={form.date}
        onChange={(event) =>
          onFormChange({ ...form, date: event.target.value })
        }
        required
      />
      {form.type === "transfer" ? (
        <div className="grid gap-1">
          <SelectField
            label="To account"
            value={form.transferToAccountId}
            onChange={(event) => {
              const transferToAccountId = event.target.value;
              onFormChange({
                ...form,
                accountId:
                  transferToAccountId && transferToAccountId === form.accountId
                    ? ""
                    : form.accountId,
                transferToAccountId
              });
            }}
            required
          >
            <option value="">Select account</option>
            {destinationAccountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </SelectField>
          {transferAccountsMatch ? (
            <p className="text-sm text-coral dark:text-orange-300">
              {TRANSFER_ACCOUNT_VALIDATION_MESSAGE}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <SelectField
            label="Category"
            value={form.categoryId}
            onChange={(event) =>
              onFormChange({ ...form, categoryId: event.target.value })
            }
          >
            <option value="">None</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Group"
            value={form.groupId}
            onChange={(event) => {
              const groupId = event.target.value;
              const group = groups.find((item) => item.id === groupId);
              onFormChange({
                ...form,
                groupId,
                categoryId: groupId ? "" : form.categoryId,
                isShared: groupId ? true : form.isShared
              });
              if (group) onGroupSelected(group);
            }}
          >
            <option value="">None</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </SelectField>
        </>
      )}
      <div className="md:col-span-2 xl:col-span-3">
        <TextArea
          label="Notes"
          value={form.notes}
          onChange={(event) =>
            onFormChange({ ...form, notes: event.target.value })
          }
        />
        {form.type === "transfer" ? (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Transfers move money between your own accounts, so they cannot be
            shared or split.
          </p>
        ) : null}
      </div>
    </>
  );
}
