import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditableField } from "../EditableField";
import { RelatedList } from "../RelatedList";

type Row = { id: string; name: string; locked?: boolean };
const rows: Row[] = [
  { id: "1", name: "Ann" },
  { id: "tmp-2", name: "Bob", locked: true }
];
const columns = [
  { key: "name", header: "Name", cell: (r: Row) => r.name },
  { key: "id", header: "Id", cell: (r: Row) => r.id, align: "right" as const }
];
const base = { title: "People", rows, rowKey: (r: Row) => r.id, columns, emptyText: "Nobody yet" };

describe("RelatedList", () => {
  it("renders a table at sm+ and per-cell mobile labels with every column", () => {
    render(<RelatedList {...base} />);
    const table = screen.getByRole("table");
    expect(table).toHaveClass("sm:table");
    expect(within(table).getByText("Ann")).toBeInTheDocument();
    expect(within(table).getByText("tmp-2")).toBeInTheDocument();
    const cell = screen.getByText("Ann").closest("td")!;
    expect(within(cell).getByText("Name")).toHaveClass("sm:hidden");
  });

  it("shows loading, error and empty blocks instead of rows, and hides the footer there", () => {
    const footer = <p>total</p>;
    const { rerender } = render(<RelatedList {...base} isLoading footer={footer} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("total")).not.toBeInTheDocument();
    rerender(<RelatedList {...base} error="Boom" footer={footer} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Boom");
    expect(screen.queryByText("total")).not.toBeInTheDocument();
    rerender(<RelatedList {...base} rows={[]} footer={footer} />);
    expect(screen.getByText("Nobody yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    rerender(<RelatedList {...base} footer={footer} />);
    expect(screen.getByText("total")).toBeInTheDocument();
  });

  it("calls onAdd and onRemove, hiding remove for rows canRemove rejects", async () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(
      <RelatedList {...base} onAdd={onAdd} addLabel="Add person" onRemove={onRemove} canRemove={(r) => !r.locked} />
    );
    await user.click(screen.getByRole("button", { name: "Add person" }));
    expect(onAdd).toHaveBeenCalledOnce();
    const removes = screen.getAllByRole("button", { name: "Remove" });
    expect(removes).toHaveLength(1);
    await user.click(removes[0]!);
    expect(onRemove).toHaveBeenCalledWith(rows[0]);
  });

  it("hosts an EditableField cell where Escape reverts only that cell, with a tempId row key and a row error", async () => {
    function Harness() {
      const [draft, setDraft] = useState<Row[]>([
        { id: "tmp-1", name: "A" },
        { id: "tmp-2", name: "B" }
      ]);
      const errors: Record<string, string> = { "rows.1.name": "Too short" };
      return (
        <RelatedList
          {...base}
          rows={draft}
          columns={[
            {
              key: "name",
              header: "Name",
              cell: (r: Row) => {
                const i = draft.indexOf(r);
                return (
                  <EditableField label={`Name ${i}`} dirty onRevert={() => setDraft((d) => d.map((x, j) => (j === i ? { ...x, name: "A" } : x)))} error={errors[`rows.${i}.name`]}>
                    <input value={r.name} onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                  </EditableField>
                );
              }
            }
          ]}
        />
      );
    }
    const user = userEvent.setup();
    render(<Harness />);
    const first = screen.getByRole("textbox", { name: "Name 0" });
    const second = screen.getByRole("textbox", { name: "Name 1" });
    await user.type(first, "x");
    await user.type(second, "y");
    expect(first).toHaveValue("Ax");
    await user.type(first, "{Escape}");
    expect(first).toHaveValue("A");
    expect(second).toHaveValue("By");
    expect(screen.getByRole("alert")).toHaveTextContent("Too short");
  });
});
