import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { DropdownMenu } from "../DropdownMenu";

describe("DropdownMenu", () => {
  it("provides a responsive themed surface for custom menu content", () => {
    renderWithProviders(
      <DropdownMenu aria-label="Options">
        <button type="button">Option</button>
      </DropdownMenu>
    );

    const menu = screen.getByLabelText("Options");
    expect(menu).toHaveClass("max-w-[calc(100vw-2rem)]", "dark:bg-slate-900");
    expect(screen.getByRole("button", { name: "Option" })).toBeInTheDocument();
  });
});
