import { ACCOUNT_TYPES } from "@flowledger/shared";
import type { AccountType } from "@flowledger/shared";
import { ChevronDown } from "lucide-react";
import { Button } from "../../../components/Button";
import { CurrencySelect } from "../../../components/CurrencySelect";
import { SelectField, TextInput } from "../../../components/FormField";
import type { Account } from "../../../types/api";
import { formatMoney } from "../../../utils/currency";
import type { useAccountEditForm } from "../hooks/useAccountEditForm";
import { AccountSyncPanel } from "./AccountSyncPanel";

export function AccountListItem({
  account,
  editForm,
  preferredCurrency,
  isExpanded,
  onToggleExpanded,
  resyncMessages,
  isStartingCredentialFlow,
  hasCredentialFlowError,
  onResync,
  onReconnect
}: {
  account: Account;
  editForm: ReturnType<typeof useAccountEditForm>;
  preferredCurrency: string | null | undefined;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  resyncMessages: Record<string, string>;
  isStartingCredentialFlow: boolean;
  hasCredentialFlowError: boolean;
  onResync: (syncId: string) => void;
  onReconnect: (syncId: string) => void;
}) {
  if (editForm.editingAccountId === account.id) {
    return (
      <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
        <form className="grid gap-3" onSubmit={editForm.submitEdit}>
          <TextInput
            label="Name"
            value={editForm.editName}
            onChange={(event) => editForm.setEditName(event.target.value)}
            required
          />
          <div className="grid gap-3 sm:grid-cols-4">
            <SelectField
              label="Type"
              value={editForm.editType}
              onChange={(event) =>
                editForm.setEditType(event.target.value as AccountType)
              }
            >
              {ACCOUNT_TYPES.map((item) => (
                <option key={item} value={item}>
                  {item.replace("_", " ")}
                </option>
              ))}
            </SelectField>
            <TextInput
              label="Identifier"
              value={editForm.editIdentifier}
              onChange={(event) =>
                editForm.setEditIdentifier(event.target.value)
              }
            />
            <CurrencySelect
              label="Currency"
              value={editForm.editCurrency}
              onChange={editForm.setEditCurrency}
            />
            <TextInput
              label="Initial balance"
              type="number"
              step="0.01"
              value={editForm.editInitialBalance}
              onChange={(event) =>
                editForm.setEditInitialBalance(event.target.value)
              }
            />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={editForm.updateAccount.isPending}>
              Save changes
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={editForm.closeEditForm}
            >
              Cancel
            </Button>
          </div>
        </form>
      </div>
    );
  }

  const managementActions = (
    <>
      <Button type="button" variant="secondary" onClick={() => editForm.openEditForm(account)}>
        Edit
      </Button>
      {account.isArchived ? (
        <Button
          type="button"
          variant="secondary"
          disabled={editForm.restoreAccount.isPending}
          onClick={() => editForm.restoreAccount.mutate(account.id)}
        >
          Restore
        </Button>
      ) : (
        <Button
          type="button"
          variant="secondary"
          disabled={editForm.archiveAccount.isPending}
          onClick={() => editForm.archiveAccount.mutate(account.id)}
        >
          Archive
        </Button>
      )}
      <Button
        type="button"
        variant="danger"
        disabled={editForm.deleteAccount.isPending}
        onClick={() => editForm.confirmDelete(account)}
      >
        Delete
      </Button>
    </>
  );

  return (
    <div className="rounded-md border border-slate-200 p-3 dark:border-slate-800">
      <div className="grid gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{account.name}</p>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {account.source === "synced" ? "Synced" : "Manual"}
              </span>
              {account.isArchived ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  Archived
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="hidden gap-2 lg:flex">{managementActions}</div>
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-pine focus:ring-offset-2 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:focus:ring-offset-slate-950 lg:hidden"
              aria-label={`${isExpanded ? "Hide" : "Show"} details for ${account.name}`}
              aria-expanded={isExpanded}
              onClick={onToggleExpanded}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${
                  isExpanded ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        <div>
          <p className="text-sm capitalize text-slate-500 dark:text-slate-400">
            {account.type.replace("_", " ")} · {account.currency}
          </p>
          <p
            className={`text-sm font-semibold ${
              (account.currentBalance ?? 0) >= 0
                ? "text-pine dark:text-emerald-300"
                : "text-coral dark:text-orange-300"
            }`}
          >
            FlowLedger balance{" "}
            {formatMoney(account.currentBalance ?? 0, account.currency)}
          </p>
        </div>

        <div className={`grid gap-3 ${isExpanded ? "" : "hidden"} lg:grid`}>
          {preferredCurrency &&
          preferredCurrency !== account.currency &&
          account.currentBalanceInPreferredCurrency !== undefined ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {formatMoney(
                account.currentBalanceInPreferredCurrency,
                preferredCurrency
              )}
            </p>
          ) : null}
          {account.identifier ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {account.identifier}
            </p>
          ) : null}
          <div className="flex flex-col gap-2 lg:hidden">{managementActions}</div>

          <AccountSyncPanel
            account={account}
            resyncMessages={resyncMessages}
            isStartingCredentialFlow={isStartingCredentialFlow}
            hasCredentialFlowError={hasCredentialFlowError}
            onResync={onResync}
            onReconnect={onReconnect}
          />
        </div>
      </div>
    </div>
  );
}
