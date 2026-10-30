import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../tests/mocks/server";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { ProfilePage } from "../ProfilePage";
import { API_URL, mockBaseline } from "./profileFixtures";

function renderProfile(route = "/profile") {
  return renderWithProviders(<ProfilePage />, { withAuth: true, withTheme: true, route });
}

describe("ProfilePage", () => {
  it("renders the header and the General tab by default", async () => {
    mockBaseline();
    renderProfile();
    expect(await screen.findByRole("heading", { name: "Jane Doe" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "profile-panel-general");
  });

  it("falls back to General for an unknown ?tab= value", () => {
    mockBaseline();
    renderProfile("/profile?tab=bogus");
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true");
  });

  it("opens the tab named in the URL and switches tabs on click, mounting only the active panel", async () => {
    mockBaseline();
    renderProfile("/profile?tab=preferences");
    expect(screen.getByLabelText("Theme")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Upgrade" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "Subscription" }));
    expect(await screen.findByRole("button", { name: "Upgrade" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Theme")).not.toBeInTheDocument();
  });

  it("does not request API keys until the Security & API tab is opened", async () => {
    mockBaseline();
    let requested = 0;
    server.use(
      http.get(`${API_URL}/users/me/api-keys`, () => {
        requested += 1;
        return HttpResponse.json({ apiKeys: [] });
      }),
      http.get(`${API_URL}/users/me/oauth-grants`, () => HttpResponse.json({ grants: [] }))
    );
    renderProfile();
    await screen.findByRole("heading", { name: "Jane Doe" });
    expect(requested).toBe(0);

    await userEvent.click(screen.getByRole("tab", { name: "Security & API" }));
    await screen.findByText("No connected apps.");
    expect(requested).toBeGreaterThan(0);
  });
});
