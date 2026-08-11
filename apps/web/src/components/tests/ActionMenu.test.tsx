import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { ActionMenu, ActionMenuItem } from "../ActionMenu";

function renderMenu() {
  return renderWithProviders(
    <ActionMenu label="Row actions">
      <ActionMenuItem onClick={vi.fn()}>Edit</ActionMenuItem>
      <ActionMenuItem variant="danger" onClick={vi.fn()}>
        Delete
      </ActionMenuItem>
    </ActionMenu>
  );
}

describe("ActionMenu", () => {
  it("is closed by default, hiding its menu items", () => {
    renderMenu();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Row actions" })).toHaveAttribute(
      "aria-expanded",
      "false"
    );
  });

  it("opens the menu when the trigger is clicked", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Row actions" }));

    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Row actions" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("toggles closed when the trigger is clicked again", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Row actions" });
    await user.click(trigger);
    await user.click(trigger);

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when an item inside the menu is clicked", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Row actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes when clicking outside the menu", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <div>
        <ActionMenu label="Row actions">
          <ActionMenuItem onClick={vi.fn()}>Edit</ActionMenuItem>
        </ActionMenu>
        <button>Outside</button>
      </div>
    );

    await user.click(screen.getByRole("button", { name: "Row actions" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Outside" }));

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Row actions" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});

describe("ActionMenuItem", () => {
  it("calls onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(
      <ActionMenu label="Row actions">
        <ActionMenuItem onClick={onClick}>Edit</ActionMenuItem>
      </ActionMenu>
    );

    await user.click(screen.getByRole("button", { name: "Row actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Edit" }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("applies danger styling when variant='danger'", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Row actions" }));

    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveClass("text-coral");
  });

  it("is disabled when the disabled prop is set", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <ActionMenu label="Row actions">
        <ActionMenuItem disabled onClick={vi.fn()}>
          Edit
        </ActionMenuItem>
      </ActionMenu>
    );

    await user.click(screen.getByRole("button", { name: "Row actions" }));

    expect(screen.getByRole("menuitem", { name: "Edit" })).toBeDisabled();
  });
});
