import type {
  AccountType,
  Holding,
  HoldingKind,
  HoldingMissingReason
} from "@flowledger/shared";
import { CurrencySelect } from "../../../components/CurrencySelect";
import {
  EditableField,
  editableControlClassName
} from "../../../components/EditableField";
import { RelatedList } from "../../../components/RelatedList";
import type { FormDraft } from "../../../types/common.types";
import { formatMoney } from "../../../utils/currency";
import type {
  AccountDraft,
  HoldingDraft,
  HoldingPriceSource
} from "../types/accounts.types";
import {
  addHoldingRow,
  allowedHoldingKinds,
  isHoldingRowEdited,
  newHoldingDraft,
  patchHoldingRow,
  removeHoldingRow,
  validateHoldingRows
} from "../utils/holdingsDraft";
import { ManualPriceCell } from "./ManualPriceCell";
import { ValuationTime } from "./ValuationTime";

const mutedClassName = "text-sm text-slate-500 dark:text-slate-400";

const KIND_LABELS: Record<HoldingKind, string> = {
  crypto: "Crypto",
  fiat: "Cash",
  stock: "Stock",
  etf: "ETF",
  other: "Other"
};

const CODE_PLACEHOLDERS: Partial<Record<HoldingKind, string>> = {
  crypto: "BTC",
  stock: "AAPL",
  etf: "VOO"
};

const MISSING_TEXT: Record<HoldingMissingReason, string> = {
  unsupported: "No market price exists for this code. Set a manual price.",
  price_unavailable: "No price is available right now. Set a manual price.",
  rate_unavailable: "No exchange rate to the account currency is available."
};

/**
 * Holdings tab of the account Form View (investment and crypto accounts). Rows live in `draft.values.holdings`, so
 * adding, editing and removing only change the draft; the page's Save sends them as one change set and Discard drops
 * them. Which asset types can be added follows `accountType` (crypto accounts: crypto only, no selector); a saved
 * holding of a type the account does not allow stays visible with a note and can only be removed. Quantities and
 * prices are shown exactly as stored; every value and timestamp comes from the API. A row edited since the last save
 * shows "Updates on Save" instead of its now-outdated value. A missing value reads "Value missing", never 0.
 */
export function HoldingsTab({
  draft,
  accountType,
  accountCurrency,
  saved,
  isLoading,
  error
}: {
  draft: FormDraft<AccountDraft>;
  accountType: AccountType;
  accountCurrency: string;
  saved: Holding[];
  isLoading: boolean;
  error: string | null;
}) {
  const rows = draft.values.holdings;
  const savedById = new Map(saved.map((holding) => [holding.id, holding]));
  const liveErrors = validateHoldingRows(rows);
  const allowedKinds = allowedHoldingKinds(accountType);
  const showTypes = allowedKinds.length > 1;

  function rowError(index: number, field: string, value: string) {
    const key = `holdings.${index}.${field}`;
    return draft.fieldErrors[key] ?? (value.trim() ? liveErrors[key] : undefined);
  }

  function patch(row: HoldingDraft, changes: Partial<HoldingDraft>) {
    draft.update((current) => patchHoldingRow(current, row.draftId, changes));
  }

  function rowName(row: HoldingDraft, index: number) {
    return (
      row.code.trim() || row.name.trim() || `New holding ${index + 1}`
    );
  }

  function isIncompatible(row: HoldingDraft) {
    return Boolean(row.id) && !allowedKinds.includes(row.kind);
  }

  function changeKind(row: HoldingDraft, kind: HoldingKind) {
    const fresh = newHoldingDraft(kind, accountCurrency);
    patch(row, {
      kind,
      code: "",
      name: "",
      unit: "",
      priceSource: fresh.priceSource,
      manualUnitPrice: "",
      manualPriceCurrency: accountCurrency
    });
  }

  function changeSource(row: HoldingDraft, source: HoldingPriceSource) {
    patch(
      row,
      source === "automatic"
        ? { priceSource: source, manualUnitPrice: "", manualPricedAt: "" }
        : {
            priceSource: source,
            manualPriceCurrency: row.manualPriceCurrency || accountCurrency
          }
    );
  }

  function assetCell(row: HoldingDraft, index: number) {
    const badge = showTypes ? (
      <span className="block w-fit rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-slate-800">
        {KIND_LABELS[row.kind]}
      </span>
    ) : null;
    if (row.id) {
      return (
        <div>
          <p className="font-semibold">
            {row.kind === "other" ? row.name : row.code}
          </p>
          {badge}
          {isIncompatible(row) ? (
            <p className={mutedClassName}>
              Not allowed in a crypto account. Remove it or change the account
              type to Investment.
            </p>
          ) : null}
        </div>
      );
    }
    const label = rowName(row, index);
    return (
      <div className="grid gap-1">
        {showTypes ? (
          <EditableField label={`${label} type`} hideLabel>
            <select
              className={editableControlClassName}
              value={row.kind}
              onChange={(event) =>
                changeKind(row, event.target.value as HoldingKind)
              }
            >
              {allowedKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </EditableField>
        ) : null}
        {row.kind === "fiat" ? (
          <EditableField
            label={`${label} currency`}
            hideLabel
            error={rowError(index, "code", row.code)}
          >
            <CurrencySelect
              label={`${label} currency`}
              hideLabel
              value={row.code}
              onChange={(value) => patch(row, { code: value })}
            />
          </EditableField>
        ) : row.kind === "other" ? (
          <>
            <EditableField
              label={`${label} name`}
              hideLabel
              error={rowError(index, "name", row.name)}
            >
              <input
                className={editableControlClassName}
                value={row.name}
                placeholder="Name"
                onChange={(event) => patch(row, { name: event.target.value })}
              />
            </EditableField>
            <EditableField
              label={`${label} unit`}
              hideLabel
              error={rowError(index, "unit", row.unit)}
            >
              <input
                className={editableControlClassName}
                value={row.unit}
                placeholder="Unit (optional)"
                onChange={(event) => patch(row, { unit: event.target.value })}
              />
            </EditableField>
          </>
        ) : (
          <EditableField
            label={`${label} code`}
            hideLabel
            error={rowError(index, "code", row.code)}
          >
            <input
              className={editableControlClassName}
              value={row.code}
              placeholder={CODE_PLACEHOLDERS[row.kind]}
              onChange={(event) =>
                patch(row, { code: event.target.value.toUpperCase() })
              }
            />
          </EditableField>
        )}
      </div>
    );
  }

  function quantityCell(row: HoldingDraft, index: number) {
    if (isIncompatible(row)) return <span>{row.quantity}</span>;
    return (
      <div className="flex min-w-0 items-center gap-2 sm:justify-end">
        <EditableField
          label={`${rowName(row, index)} quantity`}
          hideLabel
          error={rowError(index, "quantity", row.quantity)}
        >
          <input
            className={`${editableControlClassName} sm:text-right`}
            inputMode="decimal"
            value={row.quantity}
            onChange={(event) => patch(row, { quantity: event.target.value })}
          />
        </EditableField>
        {row.kind === "other" && row.id && row.unit ? (
          <span className={mutedClassName}>{row.unit}</span>
        ) : null}
      </div>
    );
  }

  function priceCell(row: HoldingDraft, index: number) {
    if (row.kind === "fiat") return <span className={mutedClassName}>1</span>;
    if (row.priceSource === "manual" && !isIncompatible(row)) {
      return (
        <ManualPriceCell
          name={rowName(row, index)}
          amount={row.manualUnitPrice}
          currency={row.manualPriceCurrency || accountCurrency}
          error={
            rowError(index, "manualUnitPrice", row.manualUnitPrice) ??
            rowError(index, "manualPriceCurrency", row.manualPriceCurrency)
          }
          onAmountChange={(value) => patch(row, { manualUnitPrice: value })}
          onCurrencyChange={(value) =>
            patch(row, { manualPriceCurrency: value })
          }
        />
      );
    }
    const valuation = row.valuation;
    if (!valuation?.unitPrice || !valuation.priceCurrency)
      return (
        <span className={mutedClassName}>
          {row.id ? "No price" : "Quoted on Save"}
        </span>
      );
    const price = formatMoney(valuation.unitPrice, valuation.priceCurrency);
    return (
      <span>
        <ValuationTime
          valuedAt={valuation.valuedAt}
          className="hidden sm:inline-block"
        >
          {price}
        </ValuationTime>
        <ValuationTime
          valuedAt={valuation.valuedAt}
          variant="label"
          className="sm:hidden"
        >
          {price}
        </ValuationTime>
      </span>
    );
  }

  function sourceCell(row: HoldingDraft, index: number) {
    if (row.kind === "fiat") return "Cash · at par";
    if (row.kind !== "crypto" || isIncompatible(row)) return "Manual";
    return (
      <EditableField label={`${rowName(row, index)} price source`} hideLabel>
        <select
          className={editableControlClassName}
          value={row.priceSource}
          onChange={(event) =>
            changeSource(row, event.target.value as HoldingPriceSource)
          }
        >
          <option value="automatic">Binance (automatic)</option>
          <option value="manual">Manual</option>
        </select>
      </EditableField>
    );
  }

  return (
    <RelatedList<HoldingDraft>
      title="Holdings"
      rows={rows}
      rowKey={(row) => row.draftId}
      isLoading={isLoading}
      error={error}
      emptyText="No holdings yet. Add holdings to value this account."
      addLabel="Add holding"
      onAdd={() => draft.update(addHoldingRow)}
      onRemove={(row) =>
        draft.update((current) => removeHoldingRow(current, row.draftId))
      }
      columns={[
        {
          key: "asset",
          header: "Asset",
          cell: (row) => assetCell(row, rows.indexOf(row))
        },
        {
          key: "quantity",
          header: "Quantity",
          align: "right",
          cell: (row) => quantityCell(row, rows.indexOf(row))
        },
        {
          key: "price",
          header: "Unit price",
          align: "right",
          cell: (row) => priceCell(row, rows.indexOf(row))
        },
        {
          key: "source",
          header: "Source",
          cell: (row) => sourceCell(row, rows.indexOf(row))
        },
        {
          key: "value",
          header: "Value",
          align: "right",
          cell: (row) => {
            const valuation = row.valuation;
            if (!valuation || isHoldingRowEdited(row, savedById.get(row.id ?? ""))) {
              return <span className={mutedClassName}>Updates on Save</span>;
            }
            if (valuation.value === null) {
              return (
                <div>
                  <p className="font-semibold">Value missing</p>
                  {valuation.missingReason ? (
                    <p className={mutedClassName}>
                      {MISSING_TEXT[valuation.missingReason]}
                    </p>
                  ) : null}
                </div>
              );
            }
            return (
              <span className="font-semibold">
                {formatMoney(valuation.value, accountCurrency)}
              </span>
            );
          }
        }
      ]}
    />
  );
}
