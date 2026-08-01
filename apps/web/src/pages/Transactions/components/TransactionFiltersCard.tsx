import { TRANSACTION_TYPES } from "@flowledger/shared";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { SelectField, TextInput } from "../../../components/FormField";
import {
  groupByFields,
  SearchComponent
} from "../../../components/SearchComponent";
import type { SearchGroupByDef } from "../../../components/SearchComponent";
import type { TransactionSortBy } from "../../../services/transactions.client";
import type { Account, Category, Group } from "../../../types/api";

export type TransactionFilters = {
  search: string;
  transactionFilterType: string;
  dateFrom: string;
  dateTo: string;
  amountFrom: string;
  amountTo: string;
  classification: string;
};

export const emptyTransactionFilters: TransactionFilters = {
  search: "",
  transactionFilterType: "",
  dateFrom: "",
  dateTo: "",
  amountFrom: "",
  amountTo: "",
  classification: ""
};

export const transactionGroupByDefs: SearchGroupByDef[] = [
  { id: "category", label: "Category" },
  { id: "account", label: "Account" },
  { id: "month", label: "Month" }
];

export { groupByFields };

export function TransactionFiltersCard({
  filters,
  onFiltersChange,
  typeFilterValues,
  onTypeFilterValuesChange,
  accountFilterValues,
  onAccountFilterValuesChange,
  categoryFilterValues,
  onCategoryFilterValuesChange,
  groupFilterValues,
  onGroupFilterValuesChange,
  currencyFilterValues,
  onCurrencyFilterValuesChange,
  groupBys,
  onGroupBysChange,
  sortBy,
  sortDirection,
  onSortByChange,
  onSortDirectionChange,
  onClearFilters,
  accounts,
  categories,
  groups,
  currencyOptions
}: {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  typeFilterValues: string[];
  onTypeFilterValuesChange: (values: string[]) => void;
  accountFilterValues: string[];
  onAccountFilterValuesChange: (values: string[]) => void;
  categoryFilterValues: string[];
  onCategoryFilterValuesChange: (values: string[]) => void;
  groupFilterValues: string[];
  onGroupFilterValuesChange: (values: string[]) => void;
  currencyFilterValues: string[];
  onCurrencyFilterValuesChange: (values: string[]) => void;
  groupBys: string[];
  onGroupBysChange: (values: string[]) => void;
  sortBy: TransactionSortBy;
  sortDirection: "asc" | "desc";
  onSortByChange: (value: TransactionSortBy) => void;
  onSortDirectionChange: (value: "asc" | "desc") => void;
  onClearFilters: () => void;
  accounts: Account[];
  categories: Category[];
  groups: Group[];
  currencyOptions: string[];
}) {
  const [areAdvancedFiltersOpen, setAreAdvancedFiltersOpen] = useState(false);

  return (
    <Card>
      <SearchComponent
        searchValue={filters.search}
        searchPlaceholder="Search transactions"
        onSearchChange={(value) =>
          onFiltersChange({ ...filters, search: value })
        }
        facets={[
          {
            id: "type",
            label: "Type",
            options: TRANSACTION_TYPES.map((item) => ({
              label: item,
              value: item
            }))
          },
          {
            id: "account",
            label: "Account",
            options: accounts.map((account) => ({
              label: account.name,
              value: account.id
            }))
          },
          {
            id: "category",
            label: "Category",
            options: categories.map((category) => ({
              label: category.name,
              value: category.id
            }))
          },
          {
            id: "group",
            label: "Group",
            options: groups.map((group) => ({
              label: group.name,
              value: group.id
            }))
          },
          {
            id: "currency",
            label: "Currency",
            options: currencyOptions.map((currency) => ({
              label: currency,
              value: currency
            }))
          }
        ]}
        activeFacetValues={{
          type: typeFilterValues,
          account: accountFilterValues,
          category: categoryFilterValues,
          group: groupFilterValues,
          currency: currencyFilterValues
        }}
        onFacetValuesChange={(facetId, values) => {
          if (facetId === "type") onTypeFilterValuesChange(values);
          if (facetId === "account") onAccountFilterValuesChange(values);
          if (facetId === "category") onCategoryFilterValuesChange(values);
          if (facetId === "group") onGroupFilterValuesChange(values);
          if (facetId === "currency") onCurrencyFilterValuesChange(values);
        }}
        groupBys={transactionGroupByDefs}
        activeGroupBys={groupBys}
        onGroupBysChange={onGroupBysChange}
        sort={{
          value: sortBy,
          direction: sortDirection,
          onChange: (value) => onSortByChange(value as TransactionSortBy),
          onDirectionChange: onSortDirectionChange,
          options: [
            { label: "Date", value: "date" },
            { label: "Name", value: "name" },
            { label: "Amount", value: "amount" },
            { label: "Created date", value: "createdAt" }
          ]
        }}
      >
        <Button
          type="button"
          variant="secondary"
          className="flex w-full items-center justify-center gap-2 sm:w-auto"
          aria-expanded={areAdvancedFiltersOpen}
          onClick={() => setAreAdvancedFiltersOpen((value) => !value)}
        >
          <span>More filters</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 transition-transform ${
              areAdvancedFiltersOpen ? "rotate-180" : ""
            }`}
          />
        </Button>
        {areAdvancedFiltersOpen ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <TextInput
              label="From"
              type="date"
              value={filters.dateFrom}
              onChange={(event) =>
                onFiltersChange({ ...filters, dateFrom: event.target.value })
              }
            />
            <TextInput
              label="To"
              type="date"
              value={filters.dateTo}
              onChange={(event) =>
                onFiltersChange({ ...filters, dateTo: event.target.value })
              }
            />
            <TextInput
              label="Minimum amount"
              type="number"
              step="0.01"
              min="0"
              value={filters.amountFrom}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  amountFrom: event.target.value
                })
              }
            />
            <TextInput
              label="Maximum amount"
              type="number"
              step="0.01"
              min="0"
              value={filters.amountTo}
              onChange={(event) =>
                onFiltersChange({ ...filters, amountTo: event.target.value })
              }
            />
            <SelectField
              label="Transaction group"
              value={filters.transactionFilterType}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  transactionFilterType: event.target.value
                })
              }
            >
              <option value="">All transactions</option>
              <option value="normal">Normal transactions</option>
              <option value="settlement">Settlement transactions</option>
              <option value="expenseOffset">
                Expense reimbursement/offset transactions
              </option>
            </SelectField>
            <SelectField
              label="Classification"
              value={filters.classification}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  classification: event.target.value
                })
              }
            >
              <option value="">All</option>
              <option value="complete">Complete</option>
              <option value="needsClassification">
                Needs classification
              </option>
            </SelectField>
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={onClearFilters}
              >
                Clear filters
              </Button>
            </div>
          </div>
        ) : null}
      </SearchComponent>
    </Card>
  );
}
