import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Button } from "../../../components/Button";
import { Card } from "../../../components/Card";
import { SelectField, TextInput } from "../../../components/FormField";
import { SearchComponent } from "../../../components/SearchComponent";
import type { Account, Category } from "../../../types/api";

export type ImportedFilters = {
  status: string;
  search: string;
  provider: string;
  accountId: string;
  providerAccountId: string;
  categoryId: string;
  dateFrom: string;
  dateTo: string;
  amountFrom: string;
  amountTo: string;
};

export const emptyImportedFilters: ImportedFilters = {
  status: "pending",
  search: "",
  provider: "",
  accountId: "",
  providerAccountId: "",
  categoryId: "",
  dateFrom: "",
  dateTo: "",
  amountFrom: "",
  amountTo: ""
};

export type ImportedSortBy =
  | "transactionDate"
  | "amount"
  | "description"
  | "provider"
  | "status";

// Imported transaction filters stay single-value server-side (they drive a
// "select all filtered" batch action), so facet toggles here replace rather
// than accumulate: the new value is whichever entry in `values` isn't the
// previously active one.
function singleFacetValue(current: string, values: string[]): string {
  if (values.length === 0) return "";
  return values.find((value) => value !== current) ?? values[0] ?? "";
}

export function ImportedTransactionsFiltersCard({
  filters,
  onFiltersChange,
  sortBy,
  sortDirection,
  onSortByChange,
  onSortDirectionChange,
  accounts,
  categories,
  providerAccountOptions
}: {
  filters: ImportedFilters;
  onFiltersChange: (filters: ImportedFilters) => void;
  sortBy: ImportedSortBy;
  sortDirection: "asc" | "desc";
  onSortByChange: (value: ImportedSortBy) => void;
  onSortDirectionChange: (value: "asc" | "desc") => void;
  accounts: Account[];
  categories: Category[];
  providerAccountOptions: { id: string; label: string }[];
}) {
  const [areAdvancedFiltersOpen, setAreAdvancedFiltersOpen] = useState(false);

  return (
    <Card>
      <SearchComponent
        searchValue={filters.search}
        searchPlaceholder="Search imported transactions"
        onSearchChange={(value) =>
          onFiltersChange({ ...filters, search: value })
        }
        facets={[
          {
            id: "status",
            label: "Status",
            options: [
              { label: "Pending", value: "pending" },
              { label: "Processed", value: "processed" },
              { label: "Ignored", value: "ignored" }
            ]
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
          }
        ]}
        activeFacetValues={{
          status: filters.status ? [filters.status] : [],
          account: filters.accountId ? [filters.accountId] : [],
          category: filters.categoryId ? [filters.categoryId] : []
        }}
        onFacetValuesChange={(facetId, values) => {
          if (facetId === "status") {
            onFiltersChange({
              ...filters,
              status: singleFacetValue(filters.status, values)
            });
          }
          if (facetId === "account") {
            onFiltersChange({
              ...filters,
              accountId: singleFacetValue(filters.accountId, values)
            });
          }
          if (facetId === "category") {
            onFiltersChange({
              ...filters,
              categoryId: singleFacetValue(filters.categoryId, values)
            });
          }
        }}
        sort={{
          value: sortBy,
          direction: sortDirection,
          onChange: (value) => onSortByChange(value as ImportedSortBy),
          onDirectionChange: onSortDirectionChange,
          options: [
            { label: "Date", value: "transactionDate" },
            { label: "Description", value: "description" },
            { label: "Amount", value: "amount" },
            { label: "Provider", value: "provider" },
            { label: "Status", value: "status" }
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
          <span>Filters</span>
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
              value={filters.amountTo}
              onChange={(event) =>
                onFiltersChange({ ...filters, amountTo: event.target.value })
              }
            />
            <SelectField
              label="Provider account"
              value={filters.providerAccountId}
              onChange={(event) =>
                onFiltersChange({
                  ...filters,
                  providerAccountId: event.target.value
                })
              }
            >
              <option value="">All provider accounts</option>
              {providerAccountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label}
                </option>
              ))}
            </SelectField>
            <TextInput
              label="Provider"
              value={filters.provider}
              onChange={(event) =>
                onFiltersChange({ ...filters, provider: event.target.value })
              }
            />
            <div className="flex items-end">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                onClick={() => onFiltersChange(emptyImportedFilters)}
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
