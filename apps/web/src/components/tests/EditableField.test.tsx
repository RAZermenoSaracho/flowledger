import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditableField, editableControlClassName } from "../EditableField";

function Custom() {
  return <div role="combobox" aria-label="Custom control" />;
}

describe("EditableField", () => {
  it("renders a labelled, focusable control with no click and no edit button", async () => {
    render(
      <EditableField label="Name">
        <input className={editableControlClassName} defaultValue="Jane" />
      </EditableField>
    );
    const input = screen.getByRole("textbox", { name: "Name" });
    await userEvent.tab();
    expect(input).toHaveFocus();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(input.className).toContain("text-base");
    expect(input.className).toContain("sm:text-sm");
    expect(input.className).toContain("min-h-10");
  });

  it("hides the label visually but keeps it for assistive tech", () => {
    render(
      <EditableField label="Name" hideLabel>
        <input />
      </EditableField>
    );
    expect(screen.getByText("Name")).toHaveClass("sr-only");
    expect(screen.getByRole("textbox", { name: "Name" })).toBeInTheDocument();
  });

  it("shows the dirty marker only while dirty", () => {
    const { container, rerender } = render(
      <EditableField label="Name"><input /></EditableField>
    );
    expect(container.querySelector("[data-dirty]")).toBeNull();
    rerender(<EditableField label="Name" dirty><input /></EditableField>);
    expect(container.querySelector("[data-dirty='true']")).not.toBeNull();
  });

  it("calls onRevert on Escape only when dirty, and blur does nothing", async () => {
    const onRevert = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <>
        <EditableField label="A" onRevert={onRevert}><input /></EditableField>
        <button type="button">elsewhere</button>
      </>
    );
    await user.type(screen.getByRole("textbox"), "x{Escape}");
    expect(onRevert).not.toHaveBeenCalled();
    rerender(
      <>
        <EditableField label="A" dirty onRevert={onRevert}><input /></EditableField>
        <button type="button">elsewhere</button>
      </>
    );
    await user.type(screen.getByRole("textbox"), "{Escape}");
    expect(onRevert).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    expect(onRevert).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("renders plain text with no input when readOnly", () => {
    render(<EditableField label="Plan" readOnly display="Free" />);
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("links an error to the control with role=alert and aria-describedby", () => {
    render(
      <EditableField label="Email" error="Enter a valid email address">
        <input />
      </EditableField>
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Enter a valid email address");
    const input = screen.getByRole("textbox", { name: "Email" });
    expect(input).toHaveAttribute("aria-describedby", alert.id);
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("works with textarea, select and custom controls", () => {
    render(
      <>
        <EditableField label="Notes"><textarea /></EditableField>
        <EditableField label="Kind">
          <select><option>one</option></select>
        </EditableField>
        <EditableField label="Custom">
          <Custom />
        </EditableField>
      </>
    );
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Kind" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Custom control" })).toBeInTheDocument();
  });
});
