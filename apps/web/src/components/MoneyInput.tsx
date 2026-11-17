import { CurrencySelect } from "./CurrencySelect";

/**
 * One compact monetary field: the amount input is the primary control and the currency sits inside the same box on
 * the right as text with a chevron that opens the shared currency picker (click, Enter or ArrowDown). The amount is
 * labelled `label` and the picker `<label> currency`; both stay readable by assistive tech even when `hideLabel`
 * hides the visible text. `amount` stays a string so exact decimals are never rounded.
 */
export function MoneyInput({
  label,
  amount,
  currency,
  onAmountChange,
  onCurrencyChange,
  placeholder,
  invalid = false,
  describedBy
}: {
  label: string;
  amount: string;
  currency: string;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
  placeholder?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="flex min-w-0 items-center rounded-md border border-slate-200 bg-white transition focus-within:border-pine focus-within:ring-2 focus-within:ring-mint dark:border-slate-700 dark:bg-slate-950 dark:focus-within:ring-emerald-900">
      <input
        className="min-h-10 w-full min-w-0 flex-1 rounded-l-md bg-transparent px-2 py-2 text-base text-ink outline-none sm:text-sm dark:text-slate-100"
        inputMode="decimal"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        placeholder={placeholder}
        value={amount}
        onChange={(event) => onAmountChange(event.target.value)}
      />
      <CurrencySelect
        compact
        hideLabel
        label={`${label} currency`}
        value={currency}
        onChange={onCurrencyChange}
      />
    </div>
  );
}
