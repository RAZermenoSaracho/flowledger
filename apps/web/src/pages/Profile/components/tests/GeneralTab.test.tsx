import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { mockBaseline } from "../../tests/profileFixtures";
import { GeneralTab } from "../GeneralTab";

describe("GeneralTab", () => {
  it("shows the plan with a link to the Subscription tab", async () => {
    mockBaseline();
    renderWithProviders(<GeneralTab />, { withAuth: true });
    expect(await screen.findByText("Free")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage plan" })).toHaveAttribute(
      "href",
      "/?tab=subscription"
    );
  });
});
