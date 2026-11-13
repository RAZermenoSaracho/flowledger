import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ListSelection } from "../../../types/common.types";
import { ListView } from "../ListView";

const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
const base = {
  title: "Things", rowKey: (r: { id: string }) => r.id, renderItem: (r: { id: string }) => <span>row {r.id}</span>, emptyText: "Nothing here"
};

function selection(over: Partial<ListSelection> = {}): ListSelection {
  return {
    count: 0, allMatching: false, canSelectAllMatching: true, total: 120, isSelected: () => false,
    toggle: vi.fn(), setWindow: vi.fn(), selectAllMatching: vi.fn(), clear: vi.fn(), ...over
  };
}

describe("ListView", () => {
  it("renders title, actions and toolbar, with no wrapper when actions are absent", () => {
    const { container } = render(<ListView {...base} items={rows} />);
    expect(screen.getByRole("heading", { name: "Things" })).toBeInTheDocument();
    expect(container.querySelector(".shrink-0")).not.toBeInTheDocument();
    render(<ListView {...base} items={rows} actions={<button>Add</button>} toolbar={<div data-testid="bar" />} />);
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    expect(screen.getByTestId("bar")).toBeInTheDocument();
  });

  it("renders items in order and groups with headings, omitting empty groups", () => {
    const { unmount } = render(<ListView {...base} items={rows} />);
    expect(screen.getAllByText(/^row /).map((e) => e.textContent)).toEqual(["row a", "row b", "row c"]);
    unmount();
    render(
      <ListView {...base} groups={[{ key: "g1", label: "One", items: [rows[0]!] }, { key: "g2", label: "Two", items: [] }]} />
    );
    expect(screen.getByRole("heading", { name: "One" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Two" })).not.toBeInTheDocument();
  });

  it("shows loading only without rows, error with header kept, and empty text", () => {
    const a = render(<ListView {...base} items={[]} isLoading />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
    a.unmount();
    const b = render(<ListView {...base} items={rows} isLoading />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText("row a")).toBeInTheDocument();
    b.unmount();
    const c = render(<ListView {...base} items={[]} error="Boom" toolbar={<i>tb</i>} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    expect(screen.getByRole("heading", { name: "Things" })).toBeInTheDocument();
    expect(screen.getByText("tb")).toBeInTheDocument();
    c.unmount();
    render(<ListView {...base} items={[]} />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("applies the count rule", () => {
    const a = render(<ListView {...base} items={rows} total={12} />);
    expect(screen.getByText("3 of 12")).toBeInTheDocument();
    a.unmount();
    const b = render(<ListView {...base} items={rows} total={3} />);
    expect(screen.getByText("3 records")).toBeInTheDocument();
    b.unmount();
    const c = render(<ListView {...base} items={[rows[0]!]} />);
    expect(screen.getByText("1 record")).toBeInTheDocument();
    c.unmount();
    render(
      <ListView {...base} items={rows} pager={{ offset: 0, limit: 3, total: 12, hasNext: true, isFetching: false, onRangeChange: () => {} }} />
    );
    expect(screen.queryByText(/records$/)).not.toBeInTheDocument();
    expect(screen.getByText("1-3 / 12")).toBeInTheDocument();
  });

  it("puts the pager in its own full-width mobile row and no pager means none", () => {
    const { container } = render(
      <ListView {...base} items={rows} pager={{ offset: 0, limit: 3, total: 12, hasNext: true, isFetching: false, onRangeChange: () => {} }} />
    );
    expect(screen.getByRole("navigation").parentElement).toHaveClass("w-full", "order-last", "sm:w-auto");
    expect(container.firstElementChild).toHaveClass("min-w-0");
  });

  it("uses a two-column grid layout when asked", () => {
    render(<ListView {...base} items={rows} layout="grid" />);
    expect(screen.getByText("row a").closest(".grid")).toHaveClass("sm:grid-cols-2");
  });

  it("does not re-render a bounded toolbar element on its own", () => {
    let renders = 0;
    function Bar() {
      renders += 1;
      return <input aria-label="search" />;
    }
    const toolbar = <Bar />;
    const { rerender } = render(<ListView {...base} items={rows} toolbar={toolbar} />);
    rerender(<ListView {...base} items={rows} toolbar={toolbar} />);
    expect(renders).toBeLessThanOrEqual(2);
  });

  it("renders no selection UI unless enabled, and labelled checkboxes when enabled", async () => {
    const a = render(<ListView {...base} items={rows} />);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    a.unmount();
    const sel = selection();
    const user = userEvent.setup();
    render(<ListView {...base} items={rows} selection={sel} bulkActions={<button>Do it</button>} />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
    await user.click(screen.getByRole("checkbox", { name: "Select record 2" }));
    expect(sel.toggle).toHaveBeenCalledWith("b", ["a", "b", "c"]);
    await user.click(screen.getByRole("button", { name: "Select page" }));
    expect(sel.setWindow).toHaveBeenCalledWith(["a", "b", "c"], true);
    expect(screen.getByRole("button", { name: "Do it" })).toBeInTheDocument();
    expect(screen.getByText("0 selected")).toBeInTheDocument();
  });

  it("offers Select all N matching once the window is selected", async () => {
    const sel = selection({ count: 3, isSelected: () => true });
    render(<ListView {...base} items={rows} selection={sel} />);
    await userEvent.click(screen.getByRole("button", { name: "Select all 120 matching" }));
    expect(sel.selectAllMatching).toHaveBeenCalled();
    within(screen.getByRole("toolbar")).getByRole("button", { name: "Clear" });
  });
});
