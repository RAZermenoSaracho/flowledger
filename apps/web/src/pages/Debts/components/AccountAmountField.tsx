import { TextInput } from "../../../components/FormField";
import { useRateSuggestion } from "../../../hooks/useRateSuggestion";
import type { Account } from "../../../types/accounts.types";
import { amountPrecisionError } from "../../../utils/currency";

/**
 * Required "Amount in account currency" input of the settlement request and approval forms. It
 * renders only when the chosen account's currency differs from the settlement's `currency`, and
 * is prefilled (while empty) with the current-rate conversion of `amount`; the user may overwrite
 * it. Shows an inline precision error for the account currency instead of rounding.
 */
export function AccountAmountField({
  accounts,
  accountId,
  currency,
  amount,
  value,
  onChange
}: {
  accounts: Account[];
  accountId: string;
  currency: string;
  amount: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const accountCurrency = accounts.find((account) => account.id === accountId)?.currency ?? null;
  const differs = accountCurrency !== null && accountCurrency !== currency;
  useRateSuggestion({
    enabled: differs,
    from: currency,
    to: differs ? accountCurrency : null,
    amount,
    current: value,
    resetKey: accountId,
    onSuggest: onChange
  });
  if (!differs) return null;

  const error = value.trim() ? amountPrecisionError(value, accountCurrency) : null;
  return (
    <div className="grid gap-1">
      <TextInput
        label={`Amount in account currency (${accountCurrency})`}
        type="number"
        step="any"
        min="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
      {error ? <p className="text-xs text-coral dark:text-red-400">{error}</p> : null}
    </div>
  );
}
