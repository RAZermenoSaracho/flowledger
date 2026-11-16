import type { Holding, HoldingMissingReason } from "@flowledger/shared";
import { Button } from "../../../components/Button";
import { CurrencySelect } from "../../../components/CurrencySelect";
import {
  EditableField,
  editableControlClassName
} from "../../../components/EditableField";
import { RelatedList } from "../../../components/RelatedList";
import type { FormDraft } from "../../../types/common.types";
import { formatMoney } from "../../../utils/currency";
import type { AccountDraft, HoldingDraft } from "../types/accounts.types";
import {
  addHoldingRow,
  isHoldingRowEdited,
  patchHoldingRow,
  removeHoldingRow,
  validateHoldingRows
} from "../utils/holdingsDraft";
import { ValuationTime } from "./ValuationTime";

const mutedClassName = "text-sm text-slate-500 dark:text-slate-400";

const SOURCE_LABELS = {
  cash: "Cash",
  manual: "Manual",
  market: "Market (Binance, USDT = USD)"
} as const;

const MISSING_TEXT: Record<HoldingMissingReason, string> = {
  unsupported: "No market price exists for this code. Set a manual price.",
  price_unavailable: "No price is available right now. Set a manual price.",
  rate_unavailable: "No exchange rate to the account currency is available."
};

/**
 * Holdings tab of the account Form View (investment and crypto accounts). Rows live in `draft.values.holdings`, so
 * adding, editing and removing only change the draft; the page's Save sends them as one change set and Discard drops
 * them. Quantities and prices are shown exactly as stored; every value, source and timestamp comes from the API. A
 * row edited since the last save shows "Updates on Save" instead of its now-outdated value. A missing value reads
 * "Value missing" with its reason and never 0.
 */
export function HoldingsTab({
  draft,
  accountCurrency,
  saved,
  isLoading,
  error
}: {
  draft: FormDraft<AccountDraft>;
  accountCurrency: string;
  saved: Holding[];
  isLoading: boolean;
  error: string | null;
}) {
  const rows = draft.values.holdings;
  const savedById = new Map(saved.map((holding) => [holding.id, holding]));
  const liveErrors = validateHoldingRows(rows);

  function rowError(index: number, field: string, value: string) {
    const key = `holdings.${index}.${field}`;
    return draft.fieldErrors[key] ?? (value.trim() ? liveErrors[key] : undefined);
  }

  function patch(row: HoldingDraft, changes: Partial<HoldingDraft>) {
    draft.update((current) => patchHoldingRow(current, row.draftId, changes));
  }

  function rowName(row: HoldingDraft, index: number) {
    return row.code.trim() || `New holding ${index + 1}`;
  }

  return (
    <div className="grid gap-3">
      <RelatedList<HoldingDraft>
        title="Holdings"
        rows={rows}
        rowKey={(row) => row.draftId}
        isLoading={isLoading}
        error={error}
        emptyText="No holdings yet. Add cash or a crypto asset to value this account."
        addLabel="Add holding"
        onAdd={() => draft.update(addHoldingRow)}
        onRemove={(row) =>
          draft.update((current) => removeHoldingRow(current, row.draftId))
        }
        columns={[
          {
            key: "instrument",
            header: "Instrument",
            cell: (row) => {
              const index = rows.indexOf(row);
              if (row.id) {
                return (
                  <div>
                    <p className="font-semibold">{row.code}</p>
                    {row.kind === "fiat" ? (
                      <span className="block w-fit rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-slate-800">
                        Cash
                      </span>
                    ) : (
                      <p className={mutedClassName}>Crypto</p>
                    )}
                  </div>
                );
              }
              return (
                <div className="grid gap-1">
                  <EditableField label={`${rowName(row, index)} kind`} hideLabel>
                    <select
                      className={editableControlClassName}
                      value={row.kind}
                      onChange={(event) =>
                        patch(row, {
                          kind: event.target.value as HoldingDraft["kind"],
                          manualUnitPrice: ""
                        })
                      }
                    >
                      <option value="crypto">Crypto</option>
                      <option value="fiat">Cash</option>
                    </select>
                  </EditableField>
                  <EditableField
                    label={`${rowName(row, index)} code`}
                    hideLabel
                    error={rowError(index, "code", row.code)}
                  >
                    <input
                      className={editableControlClassName}
                      value={row.code}
                      placeholder={row.kind === "fiat" ? "USD" : "BTC"}
                      onChange={(event) =>
                        patch(row, { code: event.target.value.toUpperCase() })
                      }
                    />
                  </EditableField>
                </div>
              );
            }
          },
          {
            key: "quantity",
            header: "Quantity",
            align: "right",
            cell: (row) => {
              const index = rows.indexOf(row);
              return (
                <EditableField
                  label={`${rowName(row, index)} quantity`}
                  hideLabel
                  error={rowError(index, "quantity", row.quantity)}
                >
                  <input
                    className={`${editableControlClassName} sm:text-right`}
                    inputMode="decimal"
                    value={row.quantity}
                    onChange={(event) =>
                      patch(row, { quantity: event.target.value })
                    }
                  />
                </EditableField>
              );
            }
          },
          {
            key: "price",
            header: "Unit price",
            align: "right",
            cell: (row) => {
              const index = rows.indexOf(row);
              const valuation = row.valuation;
              const price =
                valuation?.unitPrice && valuation.priceCurrency
                  ? formatMoney(valuation.unitPrice, valuation.priceCurrency)
                  : null;
              return (
                <div className="grid gap-1">
                  {price ? (
                    <span>
                      <ValuationTime
                        valuedAt={valuation?.valuedAt ?? null}
                        className="hidden sm:inline-block"
                      >
                        {price}
                      </ValuationTime>
                      <ValuationTime
                        valuedAt={valuation?.valuedAt ?? null}
                        variant="label"
                        className="sm:hidden"
                      >
                        {price}
                      </ValuationTime>
                    </span>
                  ) : (
                    <span className={mutedClassName}>No price</span>
                  )}
                  {row.kind === "crypto" ? (
                    <div className="grid gap-1 text-left">
                      <EditableField
                        label={`${rowName(row, index)} manual price`}
                        error={rowError(index, "manualUnitPrice", row.manualUnitPrice)}
                      >
                        <input
                          className={editableControlClassName}
                          inputMode="decimal"
                          value={row.manualUnitPrice}
                          placeholder="Optional"
                          onChange={(event) =>
                            patch(row, { manualUnitPrice: event.target.value })
                          }
                        />
                      </EditableField>
                      {row.manualUnitPrice.trim() ? (
                        <>
                          <EditableField
                            label={`${rowName(row, index)} manual price currency`}
                            hideLabel
                            error={rowError(index, "manualPriceCurrency", row.manualPriceCurrency)}
                          >
                            <CurrencySelect
                              label={`${rowName(row, index)} manual price currency`}
                              hideLabel
                              value={row.manualPriceCurrency}
                              onChange={(value) =>
                                patch(row, { manualPriceCurrency: value })
                              }
                            />
                          </EditableField>
                          <EditableField
                            label={`${rowName(row, index)} valuation date`}
                            error={rowError(index, "manualPricedAt", row.manualPricedAt)}
                          >
                            <input
                              className={editableControlClassName}
                              type="datetime-local"
                              value={row.manualPricedAt}
                              onChange={(event) =>
                                patch(row, { manualPricedAt: event.target.value })
                              }
                            />
                          </EditableField>
                          <Button
                            type="button"
                            variant="secondary"
                            aria-label={`Clear manual price for ${rowName(row, index)}`}
                            onClick={() =>
                              patch(row, {
                                manualUnitPrice: "",
                                manualPricedAt: ""
                              })
                            }
                          >
                            Clear manual price
                          </Button>
                        </>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            }
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
          },
          {
            key: "source",
            header: "Source",
            cell: (row) =>
              row.valuation?.source ? SOURCE_LABELS[row.valuation.source] : "-"
          }
        ]}
      />
      {rows.length > 0 ? (
        <p className={mutedClassName}>
          Deposits and withdrawals change &ldquo;Net deposited&rdquo;, not the
          holdings value. Update the cash holding by editing it.
        </p>
      ) : null}
    </div>
  );
}
