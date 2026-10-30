import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { MultiSelectFilter } from "../MultiSelectFilter";

const options = [
  { id: "g1", label: "Roommates" },
  { id: "g2", label: "Trip" }
];

function renderFilter(
  overrides: Partial<Parameters<typeof MultiSelectFilter>[0]> = {}
) {
  const onChange = vi.fn();
  const result = renderWithProviders(
    <MultiSelectFilter
      label="Groups"
      options={options}
      selectedIds={[]}
      allLabel="All groups"
      emptyText="No groups yet."
      onChange={onChange}
      {...overrides}
    />
  );
  return { onChange, ...result };
}

describe("MultiSelectFilter", () => {
  it("closes when its trigger is clicked again after search receives focus", async () => {
    const user = userEvent.setup();
    renderFilter();
    const trigger = screen.getByRole("button", { name: "Groups All groups" });

    await user.click(trigger);
    expect(screen.getByRole("searchbox")).toHaveFocus();
    await user.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows the allLabel when nothing is selected", () => {
    renderFilter();
    expect(
      screen.getByRole("button", { name: "Groups All groups" })
    ).toBeInTheDocument();
  });

  it("shows the emptyText and disables the trigger when there are no options", () => {
    renderFilter({ options: [] });
    expect(
      screen.getByRole("button", { name: "Groups No groups yet." })
    ).toBeDisabled();
  });

  it("shows an N-selected summary once options are selected", () => {
    renderFilter({ selectedIds: ["g1", "g2"] });
    expect(
      screen.getByRole("button", { name: "Groups 2 selected" })
    ).toBeInTheDocument();
  });

  it("opens the dropdown, lists options, and toggles a selection", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter();

    await user.click(screen.getByRole("button", { name: "Groups All groups" }));
    await user.click(screen.getByRole("option", { name: "Roommates" }));

    expect(onChange).toHaveBeenCalledWith(["g1"]);
  });

  it("deselects an already-selected option", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter({ selectedIds: ["g1"] });

    await user.click(screen.getByRole("button", { name: "Groups 1 selected" }));
    await user.click(screen.getByRole("option", { name: "Roommates" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("filters options via the search box", async () => {
    const user = userEvent.setup();
    renderFilter();

    await user.click(screen.getByRole("button", { name: "Groups All groups" }));
    await user.type(screen.getByPlaceholderText("Search groups"), "trip");

    expect(
      screen.queryByRole("option", { name: "Roommates" })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Trip" })).toBeInTheDocument();
  });

  it("shows 'No matches found.' when the search matches nothing", async () => {
    const user = userEvent.setup();
    renderFilter();

    await user.click(screen.getByRole("button", { name: "Groups All groups" }));
    await user.type(
      screen.getByPlaceholderText("Search groups"),
      "nonexistent"
    );

    expect(screen.getByText("No matches found.")).toBeInTheDocument();
  });

  it("'Select all' selects every option and 'Clear' deselects everything", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter();

    await user.click(screen.getByRole("button", { name: "Groups All groups" }));
    await user.click(screen.getByRole("button", { name: "Select all" }));

    expect(onChange).toHaveBeenCalledWith(["g1", "g2"]);
  });

  it("disables 'Clear' when nothing is selected", async () => {
    const user = userEvent.setup();
    renderFilter();

    await user.click(screen.getByRole("button", { name: "Groups All groups" }));

    expect(screen.getByRole("button", { name: "Clear" })).toBeDisabled();
  });

  it("closes on outside click and Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <MultiSelectFilter
          label="Groups"
          options={options}
          selectedIds={[]}
          allLabel="All groups"
          emptyText="No groups yet."
          onChange={vi.fn()}
        />
        <button>Outside</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Groups All groups" }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Groups All groups" }));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("moves through options with arrows and toggles with Space without closing", async () => {
    const user = userEvent.setup();
    const { onChange } = renderFilter();

    await user.click(screen.getByRole("button", { name: "Groups All groups" }));
    expect(
      screen.getByRole("searchbox", { name: "Search groups" })
    ).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("option", { name: "Roommates" })).toHaveFocus();
    await user.keyboard(" ");

    expect(onChange).toHaveBeenCalledWith(["g1"]);
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Roommates" })).toHaveAttribute(
      "aria-selected",
      "false"
    );
    await user.keyboard("{ArrowDown}{End}{Home}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["g1"]);
  });

  it("keeps Tab inside the open popup and closes when focus leaves", async () => {
    const user = userEvent.setup();
    renderFilter();
    const trigger = screen.getByRole("button", { name: "Groups All groups" });

    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole("button", { name: "Select all" })).toHaveFocus();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.tab();
    await user.tab();
    expect(screen.getByRole("option", { name: "Roommates" })).toHaveFocus();
    await user.tab();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });
});
