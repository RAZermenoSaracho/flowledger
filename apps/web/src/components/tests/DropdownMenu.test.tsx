import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { DropdownMenu } from "../DropdownMenu";

describe("DropdownMenu", () => {
  it("renders children, forwards props, and merges className", () => {
    renderWithProviders(
      <DropdownMenu
        id="menu"
        role="dialog"
        aria-label="Options"
        className="p-3"
      >
        <button type="button">Option</button>
      </DropdownMenu>
    );

    const menu = screen.getByRole("dialog", { name: "Options" });
    expect(menu).toHaveAttribute("id", "menu");
    expect(menu).toHaveClass("p-3", "absolute");
    expect(menu).toContainElement(
      screen.getByRole("button", { name: "Option" })
    );
  });
});
