import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import {
  createConditionWithValue,
  createEmptyGroup,
  type GroupableField,
  type SearchFieldConfig,
  type SortableField
} from "../../utils/searchDomain";
import { SearchBar } from "../SearchBar";

const nameField: SearchFieldConfig = { name: "name", label: "Name", type: "string" };
const amountField: SearchFieldConfig = { name: "amount", label: "Amount", type: "number" };
const fields = [nameField, amountField];
const groupableFields: GroupableField[] = [{ name: "categoryId", label: "Category" }];
const sortableFields: SortableField[] = [
  { name: "date", label: "Date" },
  { name: "amount", label: "Amount" }
];

describe("SearchBar", () => {
  it("calls onQueryChange once on mount with an empty query", async () => {
    const onQueryChange = vi.fn();
    renderWithProviders(<SearchBar fields={fields} onQueryChange={onQueryChange} />);

    await waitFor(() => expect(onQueryChange).toHaveBeenCalledWith({ where: undefined }));
  });

  it("shows the free-text box only when defaultSearchField is set", () => {
    const { rerender } = renderWithProviders(
      <SearchBar fields={fields} onQueryChange={vi.fn()} placeholder="Search transactions" />
    );
    expect(screen.queryByLabelText("Search transactions")).not.toBeInTheDocument();

    rerender(
      <SearchBar
        fields={fields}
        onQueryChange={vi.fn()}
        placeholder="Search transactions"
        defaultSearchField="name"
      />
    );
    expect(screen.getByLabelText("Search transactions")).toBeInTheDocument();
  });

  it("adds a filter pill and calls onQueryChange with a compiled where clause on Enter", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    renderWithProviders(
      <SearchBar
        fields={fields}
        onQueryChange={onQueryChange}
        defaultSearchField="name"
        placeholder="Search"
      />
    );

    await user.type(screen.getByLabelText("Search"), "groceries{Enter}");

    expect(screen.getByText("Name contains groceries")).toBeInTheDocument();
    await waitFor(() =>
      expect(onQueryChange).toHaveBeenLastCalledWith({
        where: { field: "name", op: "ilike", value: "groceries" }
      })
    );
    expect(screen.getByLabelText("Search")).toHaveValue("");
  });

  it("removes a pill when its remove button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SearchBar
        fields={fields}
        onQueryChange={vi.fn()}
        defaultSearchField="name"
        placeholder="Search"
      />
    );

    await user.type(screen.getByLabelText("Search"), "groceries{Enter}");
    await user.click(screen.getByRole("button", { name: "Remove Name contains groceries filter" }));

    expect(screen.queryByText("Name contains groceries")).not.toBeInTheDocument();
  });

  it("opens the filter/group/sort panel and toggles a group-by field", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    renderWithProviders(
      <SearchBar
        fields={fields}
        groupableFields={groupableFields}
        onQueryChange={onQueryChange}
      />
    );

    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));
    await user.click(screen.getByLabelText("Category"));

    expect(screen.getByText("Group by Category")).toBeInTheDocument();
    await waitFor(() =>
      expect(onQueryChange).toHaveBeenLastCalledWith({
        where: undefined,
        groupBy: ["categoryId"]
      })
    );
  });

  it("removes a group-by pill by clicking its remove button", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SearchBar fields={fields} groupableFields={groupableFields} onQueryChange={vi.fn()} />
    );

    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));
    await user.click(screen.getByLabelText("Category"));
    await user.click(screen.getByRole("button", { name: "Remove Group by Category filter" }));

    expect(screen.queryByText("Group by Category")).not.toBeInTheDocument();
  });

  it("closes the panel when clicking outside", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <SearchBar fields={fields} onQueryChange={vi.fn()} />
        <button>Outside</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes the panel on Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchBar fields={fields} onQueryChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("defaults sort to the first sortable field, descending, and lets the user change both", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn();
    renderWithProviders(
      <SearchBar fields={fields} sortableFields={sortableFields} onQueryChange={onQueryChange} />
    );

    await waitFor(() =>
      expect(onQueryChange).toHaveBeenLastCalledWith({
        where: undefined,
        sort: [{ field: "date", direction: "desc" }]
      })
    );

    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));
    await user.selectOptions(screen.getByLabelText("Sort by"), "amount");
    await user.click(screen.getByRole("button", { name: "Sort descending" }));

    await waitFor(() =>
      expect(onQueryChange).toHaveBeenLastCalledWith({
        where: undefined,
        sort: [{ field: "amount", direction: "asc" }]
      })
    );
  });

  it("respects an explicit initialSort over the first sortable field", async () => {
    const onQueryChange = vi.fn();
    renderWithProviders(
      <SearchBar
        fields={fields}
        sortableFields={sortableFields}
        initialSort={{ field: "amount", direction: "asc" }}
        onQueryChange={onQueryChange}
      />
    );

    await waitFor(() =>
      expect(onQueryChange).toHaveBeenLastCalledWith({
        where: undefined,
        sort: [{ field: "amount", direction: "asc" }]
      })
    );
  });

  it("seeds the domain from initialDomain and shows it as a pill", () => {
    const initialDomain = {
      ...createEmptyGroup("and"),
      children: [createConditionWithValue("name", "=", "groceries")]
    };
    renderWithProviders(
      <SearchBar fields={fields} initialDomain={initialDomain} onQueryChange={vi.fn()} />
    );

    expect(screen.getByText("Name is groceries")).toBeInTheDocument();
  });

  it("shows 'Clear all filters' only once a condition or group-by is active, and clears everything", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SearchBar
        fields={fields}
        groupableFields={groupableFields}
        onQueryChange={vi.fn()}
        defaultSearchField="name"
        placeholder="Search"
      />
    );

    expect(screen.queryByRole("button", { name: "Clear all filters" })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText("Search"), "groceries{Enter}");
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Clear all filters" }));

    expect(screen.queryByText("Name contains groceries")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear all filters" })).not.toBeInTheDocument();
  });

  it("opens FilterBuilder from the panel and applies an edited domain back as a pill", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SearchBar fields={fields} onQueryChange={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));
    await user.click(screen.getByRole("button", { name: "Edit filters" }));

    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "+ Condition" }));
    await user.click(screen.getByRole("button", { name: "Done" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear all filters" })).toBeInTheDocument();
  });

  it("marks 'Edit filters' as active once a condition exists", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SearchBar
        fields={fields}
        onQueryChange={vi.fn()}
        defaultSearchField="name"
        placeholder="Search"
      />
    );

    await user.type(screen.getByLabelText("Search"), "groceries{Enter}");
    await user.click(screen.getByRole("button", { name: "Filter, group, and sort" }));

    expect(screen.getByRole("button", { name: "Edit filters (active)" })).toBeInTheDocument();
  });
});
