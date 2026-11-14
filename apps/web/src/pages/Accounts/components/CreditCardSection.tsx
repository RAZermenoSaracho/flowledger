import { PAYMENT_DUE_RULES } from "@flowledger/shared";
import { EditableField, editableControlClassName } from "../../../components/EditableField";
import type { AccountDraft, AccountTypeSectionProps } from "../types/accounts.types";
import { deviceTimeZone } from "../utils/creditCardDraft";

const RULE_LABELS: Record<(typeof PAYMENT_DUE_RULES)[number], string> = {
  day_of_next_month: "Day of the next month",
  days_after_closing: "Days after closing"
};

/**
 * Credit card configuration on the account General tab: limit, statement closing day, payment due
 * rule and value, billing time zone and annual interest rate. Edits the shared account draft, so it
 * saves with the common fields. Setting any billing-cycle field defaults the time zone to the device zone.
 */
export function CreditCardSection({ draft }: AccountTypeSectionProps) {
  const { values } = draft;

  function field(key: keyof AccountDraft) {
    return {
      error: draft.fieldErrors[key],
      dirty: draft.changedKeys.includes(key),
      onRevert: () => draft.revertField(key)
    };
  }

  function cycle(key: keyof AccountDraft, value: string) {
    draft.setField(key, value as never);
    if (key !== "billingTimeZone" && !values.billingTimeZone) {
      draft.setField("billingTimeZone", deviceTimeZone());
    }
  }

  return (
    <section aria-label="Credit card" className="mt-4 grid gap-4">
      <h3 className="text-base font-semibold">Credit card</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <EditableField label="Credit limit" {...field("creditLimit")}>
          <input
            className={editableControlClassName}
            type="number"
            step="any"
            min="0"
            value={values.creditLimit}
            onChange={(event) => draft.setField("creditLimit", event.target.value)}
          />
        </EditableField>
        <EditableField label="Statement closing day" {...field("statementClosingDay")}>
          <input
            className={editableControlClassName}
            type="number"
            min="1"
            max="31"
            value={values.statementClosingDay}
            onChange={(event) => cycle("statementClosingDay", event.target.value)}
          />
        </EditableField>
        <EditableField label="Payment due rule" {...field("paymentDueRule")}>
          <select
            className={editableControlClassName}
            value={values.paymentDueRule}
            onChange={(event) => cycle("paymentDueRule", event.target.value)}
          >
            <option value="">Not set</option>
            {PAYMENT_DUE_RULES.map((rule) => (
              <option key={rule} value={rule}>
                {RULE_LABELS[rule]}
              </option>
            ))}
          </select>
        </EditableField>
        <EditableField label="Payment due value" {...field("paymentDueValue")}>
          <input
            className={editableControlClassName}
            type="number"
            min="1"
            value={values.paymentDueValue}
            onChange={(event) => cycle("paymentDueValue", event.target.value)}
          />
        </EditableField>
        <EditableField label="Billing time zone" {...field("billingTimeZone")}>
          <input
            className={editableControlClassName}
            placeholder="America/Mexico_City"
            value={values.billingTimeZone}
            onChange={(event) => cycle("billingTimeZone", event.target.value)}
          />
        </EditableField>
        <EditableField label="Annual interest rate (%)" {...field("annualInterestRate")}>
          <input
            className={editableControlClassName}
            type="number"
            step="any"
            min="0"
            value={values.annualInterestRate}
            onChange={(event) => draft.setField("annualInterestRate", event.target.value)}
          />
        </EditableField>
      </div>
    </section>
  );
}
