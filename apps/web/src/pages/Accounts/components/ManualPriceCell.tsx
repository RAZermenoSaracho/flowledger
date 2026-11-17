import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { MoneyInput } from "../../../components/MoneyInput";
import { formatMoney } from "../../../utils/currency";

/**
 * Manual unit price of a holdings row. At rest it is plain formatted text (a button named `Edit unit price of
 * <name>`); clicking it, or pressing Enter or Space on it, swaps in the inline `MoneyInput`. Escape (unless it closes the
 * open currency list), Enter in the amount field, or focus leaving the cell returns to text showing the draft value;
 * Escape puts focus back on the text button. A row without a price starts
 * in edit mode. `error` stays visible in both modes.
 */
export function ManualPriceCell({
  name,
  amount,
  currency,
  error,
  onAmountChange,
  onCurrencyChange
}: {
  name: string;
  amount: string;
  currency: string;
  error?: string;
  onAmountChange: (value: string) => void;
  onCurrencyChange: (value: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(() => !amount.trim());
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusAfterRender = useRef<"input" | "button" | null>(null);

  useEffect(() => {
    if (focusAfterRender.current === "input") rootRef.current?.querySelector("input")?.focus();
    if (focusAfterRender.current === "button") buttonRef.current?.focus();
    focusAfterRender.current = null;
  }, [isEditing]);

  function activate() {
    focusAfterRender.current = "input";
    setIsEditing(true);
  }

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (rootRef.current?.contains(event.relatedTarget as Node | null)) return;
    if (amount.trim()) setIsEditing(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const onCurrencyPicker = target.getAttribute("role") === "combobox";
    const pickerOpen = onCurrencyPicker && target.getAttribute("aria-expanded") === "true";
    if ((event.key === "Escape" && !pickerOpen) || (event.key === "Enter" && !onCurrencyPicker)) {
      if (!amount.trim()) return;
      // Enter keeps focus where it lands: refocusing the button mid-keystroke would let the same Enter re-activate it.
      if (event.key === "Escape") focusAfterRender.current = "button";
      setIsEditing(false);
    }
  }

  return (
    <div ref={rootRef} className="min-w-0" onBlur={handleBlur} onKeyDown={handleKeyDown}>
      {isEditing ? (
        <MoneyInput
          label={`${name} manual price`}
          amount={amount}
          currency={currency}
          placeholder="0.00"
          invalid={Boolean(error)}
          onAmountChange={onAmountChange}
          onCurrencyChange={onCurrencyChange}
        />
      ) : (
        <button
          ref={buttonRef}
          type="button"
          aria-label={`Edit unit price of ${name}`}
          className="min-h-10 rounded-md border border-transparent px-2 py-2 text-base hover:border-slate-200 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-pine sm:text-sm dark:hover:border-slate-700 dark:hover:bg-slate-900"
          onClick={activate}
        >
          {formatMoney(amount, currency)}
        </button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
