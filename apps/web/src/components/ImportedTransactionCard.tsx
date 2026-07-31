import { Button } from "./Button";
import { SelectField } from "./FormField";
import type { Category, ProviderImportedTransaction } from "../types/api";
import { formatMoney } from "../utils/currency";

export function importedTransactionType(
  transaction: ProviderImportedTransaction
) {
  if (transaction.amount < 0) return "expense" as const;
  if (transaction.amount > 0) return "income" as const;
  return null;
}

function providerAccountMetadataValue(
  transaction: ProviderImportedTransaction,
  key: string
) {
  const value = transaction.providerAccount?.accountMetadata?.[key];
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : null;
}

export function providerAccountLabel(
  transaction: ProviderImportedTransaction
) {
  return [
    providerAccountMetadataValue(transaction, "name"),
    transaction.providerAccount?.connection?.institutionName,
    transaction.providerAccountId
  ]
    .filter(Boolean)
    .join(" · ");
}

function importedStatusClass(status: ProviderImportedTransaction["status"]) {
  if (status === "pending") {
    return "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-700";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";
}

function metadataLine(transaction: ProviderImportedTransaction) {
  const institution =
    transaction.providerAccount?.connection?.institutionName ??
    "Institution unavailable";
  const providerAccount =
    providerAccountLabel(transaction) || "Provider account unavailable";
  const linkedAccount =
    transaction.providerAccount?.account?.name ?? "Not linked to an account";

  return `${transaction.provider} · ${institution} · ${providerAccount} · ${linkedAccount}`;
}

type ImportedTransactionCardProps = {
  transaction: ProviderImportedTransaction;
  categories: Category[];
  isSelected: boolean;
  isSelectionLocked: boolean;
  isImporting: boolean;
  isIgnoring: boolean;
  isUnignoring: boolean;
  onSelectedChange: () => void;
  onCategoryChange: (categoryId: string | null) => void;
  onImport: () => void;
  onIgnore: () => void;
  onUnignore: () => void;
};

export function ImportedTransactionCard({
  transaction,
  categories,
  isSelected,
  isSelectionLocked,
  isImporting,
  isIgnoring,
  isUnignoring,
  onSelectedChange,
  onCategoryChange,
  onImport,
  onIgnore,
  onUnignore
}: ImportedTransactionCardProps) {
  const type = importedTransactionType(transaction);
  const compatibleCategories = categories.filter(
    (category) => !type || category.type === type
  );
  const needsCategory =
    transaction.status === "pending" && !transaction.categoryId;

  return (
    <div
      className={`grid gap-3 rounded-md border p-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center ${
        needsCategory
          ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30"
          : transaction.status === "pending"
            ? "border-slate-200 dark:border-slate-800"
            : "border-slate-200 bg-slate-50 opacity-80 dark:border-slate-800 dark:bg-slate-950/40"
      }`}
    >
      <input
        type="checkbox"
        aria-label={`Select imported transaction ${transaction.description}`}
        className="h-4 w-4 accent-pine"
        checked={isSelected}
        disabled={isSelectionLocked}
        onChange={onSelectedChange}
      />

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{transaction.description}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ring-1 ${importedStatusClass(
              transaction.status
            )}`}
          >
            {transaction.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {new Date(transaction.transactionDate).toLocaleDateString()} ·{" "}
          {transaction.category?.name ?? "Uncategorized"} ·{" "}
          {transaction.transactionId ? "Imported" : "Not imported"}
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {metadataLine(transaction)}
        </p>
        {needsCategory ? (
          <p className="mt-2 rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-900 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-100">
            This transaction needs classification before import.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 md:min-w-56">
        <div className="md:text-right">
          <p
            className={`font-semibold ${
              transaction.amount >= 0
                ? "text-pine dark:text-emerald-300"
                : "text-coral dark:text-orange-300"
            }`}
          >
            {formatMoney(transaction.amount, transaction.currency)}
          </p>
        </div>
        <SelectField
          label="Category"
          value={transaction.categoryId ?? ""}
          disabled={transaction.status !== "pending"}
          onChange={(event) => onCategoryChange(event.target.value || null)}
        >
          <option value="">Select category</option>
          {compatibleCategories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </SelectField>
        {transaction.status === "pending" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              disabled={!transaction.categoryId || isImporting}
              onClick={onImport}
            >
              Import
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isIgnoring}
              onClick={onIgnore}
            >
              Ignore
            </Button>
          </div>
        ) : null}
        {transaction.status === "ignored" ? (
          <Button
            type="button"
            variant="secondary"
            disabled={isUnignoring}
            onClick={onUnignore}
          >
            Unignore
          </Button>
        ) : null}
      </div>
    </div>
  );
}
