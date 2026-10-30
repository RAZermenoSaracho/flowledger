import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL, baseUser, mockBaseline } from "../../tests/profileFixtures";
import { SubscriptionTab } from "../SubscriptionTab";

const render = () => renderWithProviders(<SubscriptionTab />, { withAuth: true });

describe("SubscriptionTab", () => {
  it("shows Upgrade on the free plan and switches to Downgrade after clicking it", async () => {
    mockBaseline();
    let current = baseUser;
    server.use(
      http.get(`${API_URL}/users/me`, () => HttpResponse.json({ user: current })),
      http.patch(`${API_URL}/users/me/plan`, () => {
        current = { ...baseUser, planType: "flowledger_one" };
        return HttpResponse.json({ user: current });
      })
    );
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Upgrade" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Downgrade" })).toBeInTheDocument()
    );
  });

  it("shows an error when changing plan fails", async () => {
    mockBaseline();
    server.use(
      http.patch(`${API_URL}/users/me/plan`, () =>
        HttpResponse.json({ message: "Plan change unavailable" }, { status: 400 })
      )
    );
    render();
    await userEvent.click(await screen.findByRole("button", { name: "Upgrade" }));
    await waitFor(() => expect(screen.getByText("Plan change unavailable")).toBeInTheDocument());
  });
});
