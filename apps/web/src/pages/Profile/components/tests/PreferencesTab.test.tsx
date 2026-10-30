import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL, baseUser, mockBaseline } from "../../tests/profileFixtures";
import { PreferencesTab } from "../PreferencesTab";

const render = () => renderWithProviders(<PreferencesTab />, { withAuth: true, withTheme: true });

describe("PreferencesTab", () => {
  it("changes the theme preference via the Theme select", async () => {
    mockBaseline();
    render();
    await userEvent.selectOptions(screen.getByLabelText("Theme"), "dark");
    expect(screen.getByLabelText("Theme")).toHaveValue("dark");
  });

  it("toggles the mobile sidebar side via the switch", async () => {
    mockBaseline();
    server.use(
      http.patch(`${API_URL}/users/me/sidebar-side`, () =>
        HttpResponse.json({ user: { ...baseUser, mobileSidebarSide: "right" } })
      )
    );
    render();
    await waitFor(() => expect(screen.getByRole("switch")).toBeEnabled());
    expect(screen.getByText("Left sidebar drawer")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "Use right sidebar drawer" }));
    await waitFor(() => expect(screen.getByText("Right sidebar drawer")).toBeInTheDocument());
  });
});
