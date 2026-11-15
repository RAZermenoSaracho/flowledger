import { MAX_DAYS_AFTER_CLOSING } from "@flowledger/shared";
import {
  EditableField,
  editableControlClassName
} from "../../../components/EditableField";
import type {
  AccountDraft,
  AccountTypeSectionProps
} from "../types/accounts.types";
import { billingDatesExample } from "../utils/creditCardDisplay";
import { deviceTimeZone } from "../utils/creditCardDraft";

const formatDay = (date: Date) =>
  date.toLocaleDateString(undefined, { timeZone: "UTC", dateStyle: "medium" });

/**
 * Credit card configuration on the account General tab: limit, statement closing day, payment due
 * date (N days after closing, or a fixed day of the following month), billing time zone and annual interest rate,
 * with a live example of the next closing and its due date. Edits the shared account draft, so it saves with the
 * common fields. Setting any billing-cycle field defaults the time zone to the device zone.
 */
export function CreditCardSection({ draft }: AccountTypeSectionProps) {
  const { values } = draft;
  const closingDay = Number(values.statementClosingDay);
  const fixedDay = values.paymentDueRule === "day_of_next_month";
  const maxDueValue = fixedDay ? closingDay || 31 : MAX_DAYS_AFTER_CLOSING;
  const example = billingDatesExample({
    closingDay,
    rule: values.paymentDueRule,
    value: Number(values.paymentDueValue),
    maxValue: maxDueValue
  });

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
            onChange={(event) =>
              draft.setField("creditLimit", event.target.value)
            }
          />
        </EditableField>
        <EditableField
          label="Statement closing day"
          {...field("statementClosingDay")}
        >
          <input
            className={editableControlClassName}
            type="number"
            min="1"
            max="31"
            value={values.statementClosingDay}
            onChange={(event) =>
              cycle("statementClosingDay", event.target.value)
            }
          />
        </EditableField>
        <EditableField label="Payment due" {...field("paymentDueRule")}>
          <select
            className={editableControlClassName}
            value={values.paymentDueRule}
            onChange={(event) => cycle("paymentDueRule", event.target.value)}
          >
            <option value="">Not set</option>
            <option value="days_after_closing">
              Days after statement closing
            </option>
            <option value="day_of_next_month">
              On a fixed day of the following month
            </option>
          </select>
        </EditableField>
        <EditableField
          label={
            fixedDay
              ? `Due day of the following month (1–${maxDueValue})`
              : `Days after closing (1–${MAX_DAYS_AFTER_CLOSING})`
          }
          {...field("paymentDueValue")}
        >
          <input
            className={editableControlClassName}
            type="number"
            min="1"
            max={maxDueValue}
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
        <EditableField
          label="Annual interest rate (%)"
          {...field("annualInterestRate")}
        >
          <input
            className={editableControlClassName}
            type="number"
            step="any"
            min="0"
            value={values.annualInterestRate}
            onChange={(event) =>
              draft.setField("annualInterestRate", event.target.value)
            }
          />
        </EditableField>
      </div>
      <p
        className="text-sm text-slate-600 dark:text-slate-300"
        aria-live="polite"
      >
        {example
          ? `Example: the statement closing ${formatDay(example.closing)} is due ${formatDay(example.due)} (${example.days} days later). Purchases after the closing day go to the next statement.`
          : "The statement closing day is the last day included in each statement (31 means the last day of the month). Payment must be due before the next statement closes."}
      </p>
    </section>
  );
}
