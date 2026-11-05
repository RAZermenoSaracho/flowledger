import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { ProfileInlineField } from "../ProfileInlineField";

describe("ProfileInlineField", () => {
  it("hides the visible label while retaining an accessible edit name", async () => {
    renderWithProviders(
      <ProfileInlineField
        label="Name"
        hideLabel
        display="Jane Doe"
        onRevert={vi.fn()}
      >
        <input aria-label="Name" />
      </ProfileInlineField>
    );
    expect(screen.queryByText("Name")).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Edit Name: Jane Doe" })
    );
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });
});
