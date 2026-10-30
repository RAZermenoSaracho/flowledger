import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { server } from "../../../../tests/mocks/server";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL, baseUser, mockBaseline } from "../../tests/profileFixtures";
import { GeneralTab } from "../GeneralTab";
import { useProfileDetails } from "../../hooks/useProfileDetails";
import { ProfileHeader } from "../ProfileHeader";

function GeneralHarness() {
  const profile = useProfileDetails();
  return (
    <>
      <ProfileHeader profile={profile} />
      <GeneralTab profile={profile} />
    </>
  );
}

describe("GeneralTab", () => {
  it("shows loading placeholders while the profile is unresolved", () => {
    mockBaseline();
    server.use(http.get(`${API_URL}/users/me`, () => new Promise(() => {})));
    renderWithProviders(<GeneralHarness />, { withAuth: true });
    expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
    expect(screen.getByText("Member since").parentElement).toHaveTextContent(
      "Loading..."
    );
  });

  it("shows the plan with a link to the Subscription tab", async () => {
    mockBaseline();
    renderWithProviders(<GeneralHarness />, { withAuth: true });
    expect((await screen.findAllByText("Free")).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Manage plan" })).toHaveAttribute(
      "href",
      "/?tab=subscription"
    );
  });

  it("shows preferred currency and member since in General", async () => {
    mockBaseline({ ...baseUser, preferredCurrency: "USD" });
    renderWithProviders(<GeneralHarness />, { withAuth: true });
    expect(await screen.findByText("USD — US Dollar")).toBeInTheDocument();
    expect(screen.getByText("Member since")).toBeInTheDocument();
    expect(screen.queryByText("Not set")).not.toBeInTheDocument();
  });

  it("saves currency edits through the persistent profile header", async () => {
    mockBaseline();
    let payload: unknown;
    server.use(
      http.patch(`${API_URL}/users/me`, async ({ request }) => {
        payload = await request.json();
        return HttpResponse.json({
          user: { ...baseUser, preferredCurrency: "USD" }
        });
      })
    );
    renderWithProviders(<GeneralHarness />, { withAuth: true });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Edit Currency/ })
    );
    await user.click(
      await screen.findByRole("combobox", { name: "Preferred currency" })
    );
    await user.click(await screen.findByRole("option", { name: /USD/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(payload).toEqual({
        name: "Jane Doe",
        email: "jane@example.com",
        preferredCurrency: "USD"
      })
    );
  });

  it("saves a cleared currency preference as null", async () => {
    mockBaseline({ ...baseUser, preferredCurrency: "USD" });
    let payload: unknown;
    server.use(
      http.patch(`${API_URL}/users/me`, async ({ request }) => {
        payload = await request.json();
        return HttpResponse.json({ user: baseUser });
      })
    );
    renderWithProviders(<GeneralHarness />, { withAuth: true });
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Edit Currency/ })
    );
    await user.click(
      await screen.findByRole("combobox", { name: "Preferred currency" })
    );
    await user.click(
      await screen.findByRole("option", { name: "No preference" })
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(payload).toEqual({
        name: "Jane Doe",
        email: "jane@example.com",
        preferredCurrency: null
      })
    );
  });
});
