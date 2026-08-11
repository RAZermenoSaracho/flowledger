import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import {
  groupByFields,
  SearchComponent,
  type SearchFacetDef,
  type SearchGroupByDef
} from "../SearchComponent";

const facets: SearchFacetDef[] = [
  {
    id: "type",
    label: "Type",
    options: [
      { label: "Expense", value: "expense" },
      { label: "Income", value: "income" }
    ]
  }
];
const groupBys: SearchGroupByDef[] = [{ id: "category", label: "Category" }];

describe("SearchComponent", () => {
  it("omits the search input when onSearchChange/searchValue aren't both provided", () => {
    renderWithProviders(<SearchComponent searchLabel="Search" />);
    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
  });

  it("renders the search input and calls onSearchChange when typed into", async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderWithProviders(
      <SearchComponent searchValue="" searchLabel="Search" onSearchChange={onSearchChange} />
    );

    await user.type(screen.getByLabelText("Search"), "a");

    expect(onSearchChange).toHaveBeenCalled();
  });

  it("omits the filters/group-by trigger when there are no facets or group-bys", () => {
    renderWithProviders(<SearchComponent searchValue="" onSearchChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Filters and Group By" })).not.toBeInTheDocument();
  });

  it("renders active facet values as a removable pill", async () => {
    const user = userEvent.setup();
    const onFacetValuesChange = vi.fn();
    renderWithProviders(
      <SearchComponent
        facets={facets}
        activeFacetValues={{ type: ["expense"] }}
        onFacetValuesChange={onFacetValuesChange}
      />
    );

    expect(screen.getByText("Type: Expense")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Type filter" }));

    expect(onFacetValuesChange).toHaveBeenCalledWith("type", []);
  });

  it("joins multiple active facet values with 'or'", () => {
    renderWithProviders(
      <SearchComponent
        facets={facets}
        activeFacetValues={{ type: ["expense", "income"] }}
        onFacetValuesChange={vi.fn()}
      />
    );

    expect(screen.getByText("Type: Expense or Income")).toBeInTheDocument();
  });

  it("renders an active group-by as a removable pill", async () => {
    const user = userEvent.setup();
    const onGroupBysChange = vi.fn();
    renderWithProviders(
      <SearchComponent
        groupBys={groupBys}
        activeGroupBys={["category"]}
        onGroupBysChange={onGroupBysChange}
      />
    );

    expect(screen.getByText("Group by: Category")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Group by filter" }));

    expect(onGroupBysChange).toHaveBeenCalledWith([]);
  });

  it("opens the filters/group-by menu, expands a facet, and toggles an option", async () => {
    const user = userEvent.setup();
    const onFacetValuesChange = vi.fn();
    renderWithProviders(
      <SearchComponent facets={facets} onFacetValuesChange={onFacetValuesChange} />
    );

    await user.click(screen.getByRole("button", { name: "Filters and Group By" }));
    await user.click(screen.getByRole("button", { name: "Type" }));
    await user.click(screen.getByRole("checkbox", { name: "Expense" }));

    expect(onFacetValuesChange).toHaveBeenCalledWith("type", ["expense"]);
  });

  it("shows the selected-count badge next to a facet with active values", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SearchComponent
        facets={facets}
        activeFacetValues={{ type: ["expense"] }}
        onFacetValuesChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filters and Group By" }));

    expect(screen.getByRole("button", { name: "Type (1)" })).toBeInTheDocument();
  });

  it("toggles a group-by checkbox from the menu", async () => {
    const user = userEvent.setup();
    const onGroupBysChange = vi.fn();
    renderWithProviders(<SearchComponent groupBys={groupBys} onGroupBysChange={onGroupBysChange} />);

    await user.click(screen.getByRole("button", { name: "Filters and Group By" }));
    await user.click(screen.getByRole("checkbox", { name: "Category" }));

    expect(onGroupBysChange).toHaveBeenCalledWith(["category"]);
  });

  it("closes the menu on outside click and on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <SearchComponent facets={facets} onFacetValuesChange={vi.fn()} />
        <button>Outside</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Filters and Group By" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Filters and Group By" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows matching facet-option suggestions while typing, capped and only when onFacetValuesChange is set", async () => {
    const user = userEvent.setup();
    const onFacetValuesChange = vi.fn();
    renderWithProviders(
      <SearchComponent
        searchValue="inc"
        onSearchChange={vi.fn()}
        facets={facets}
        onFacetValuesChange={onFacetValuesChange}
      />
    );

    expect(screen.getByRole("button", { name: "Type: Income" })).toBeInTheDocument();
  });

  it("omits suggestions when onFacetValuesChange is not provided", () => {
    renderWithProviders(
      <SearchComponent searchValue="inc" onSearchChange={vi.fn()} facets={facets} />
    );

    expect(screen.queryByRole("button", { name: "Type: Income" })).not.toBeInTheDocument();
  });

  it("applying a suggestion sets the facet value and clears the search box", async () => {
    const user = userEvent.setup();
    const onFacetValuesChange = vi.fn();
    const onSearchChange = vi.fn();
    renderWithProviders(
      <SearchComponent
        searchValue="inc"
        onSearchChange={onSearchChange}
        facets={facets}
        onFacetValuesChange={onFacetValuesChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Type: Income" }));

    expect(onFacetValuesChange).toHaveBeenCalledWith("type", ["income"]);
    expect(onSearchChange).toHaveBeenCalledWith("");
  });

  it("renders sort options and calls onChange/onDirectionChange", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onDirectionChange = vi.fn();
    renderWithProviders(
      <SearchComponent
        sort={{
          value: "date",
          options: [
            { label: "Date", value: "date" },
            { label: "Amount", value: "amount" }
          ],
          direction: "desc",
          onChange,
          onDirectionChange
        }}
      />
    );

    await user.selectOptions(screen.getByLabelText("Sort by"), "amount");
    expect(onChange).toHaveBeenCalledWith("amount");

    await user.click(screen.getByRole("button", { name: "Sort descending" }));
    expect(onDirectionChange).toHaveBeenCalledWith("asc");
  });

  it("uses a custom sort label when provided", () => {
    renderWithProviders(
      <SearchComponent
        sort={{
          label: "Order by",
          value: "date",
          options: [{ label: "Date", value: "date" }],
          direction: "asc",
          onChange: vi.fn(),
          onDirectionChange: vi.fn()
        }}
      />
    );

    expect(screen.getByLabelText("Order by")).toBeInTheDocument();
  });

  it("renders the archive toggle and calls onChange with the clicked value", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <SearchComponent archiveToggle={{ value: "active", onChange }} />
    );

    expect(screen.getByRole("button", { name: "Active" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Archived" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    await user.click(screen.getByRole("button", { name: "Archived" }));

    expect(onChange).toHaveBeenCalledWith("archived");
  });

  it("uses custom archive toggle labels when provided", () => {
    renderWithProviders(
      <SearchComponent
        archiveToggle={{
          value: "active",
          onChange: vi.fn(),
          activeLabel: "Open",
          archivedLabel: "Closed"
        }}
      />
    );

    expect(screen.getByRole("button", { name: "Open" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Closed" })).toBeInTheDocument();
  });

  it("renders children below the toolbar", () => {
    renderWithProviders(
      <SearchComponent>
        <div data-testid="results" />
      </SearchComponent>
    );

    expect(screen.getByTestId("results")).toBeInTheDocument();
  });
});

describe("groupByFields", () => {
  type Row = { id: string; categoryId: string; categoryName: string };

  const rows: Row[] = [
    { id: "1", categoryId: "food", categoryName: "Food" },
    { id: "2", categoryId: "food", categoryName: "Food" },
    { id: "3", categoryId: "rent", categoryName: "Rent" }
  ];

  function keyOf(item: Row, groupById: string) {
    if (groupById === "categoryId") {
      return { key: item.categoryId, label: item.categoryName };
    }
    return { key: "", label: "" };
  }

  it("returns a single flat section when no group-bys are active", () => {
    expect(groupByFields(rows, [], [{ id: "categoryId", label: "Category" }], keyOf)).toEqual([
      { key: "", label: "", items: rows }
    ]);
  });

  it("returns a single flat section for an empty items list", () => {
    expect(
      groupByFields([], ["categoryId"], [{ id: "categoryId", label: "Category" }], keyOf)
    ).toEqual([{ key: "", label: "", items: [] }]);
  });

  it("buckets items by the active group-by field, sorted by key", () => {
    const result = groupByFields(
      rows,
      ["categoryId"],
      [{ id: "categoryId", label: "Category" }],
      keyOf
    );

    expect(result).toEqual([
      { key: "food", label: "Food", items: [rows[0], rows[1]] },
      { key: "rent", label: "Rent", items: [rows[2]] }
    ]);
  });

  it("ignores an active group-by id that isn't in the groupBys definition list", () => {
    const result = groupByFields(rows, ["unknownId"], [], keyOf);

    // No recognized group-by fields to bucket on, so every row collapses
    // into the same (empty) key/label bucket.
    expect(result).toEqual([{ key: "", label: "", items: rows }]);
  });
});
