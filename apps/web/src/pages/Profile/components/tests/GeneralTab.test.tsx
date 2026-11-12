import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { server } from "../../../../tests/mocks/server";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL, baseUser, mockBaseline } from "../../tests/profileFixtures";
import { GeneralTab } from "../GeneralTab";
import { useProfileDetails } from "../../hooks/useProfileDetails";
import { FormView } from "../../../../components/FormView";

function GeneralHarness({ children }: { children?: React.ReactNode }) {
  const profile = useProfileDetails();
  return (
    <FormView title="Profile" draft={profile.draft} onSave={profile.onSave}>
      <GeneralTab profile={profile}>{children}</GeneralTab>
    </FormView>
  );
}

describe("GeneralTab", () => {
  it("shows loading placeholders while the profile is unresolved", () => {
    mockBaseline();
    server.use(http.get(`${API_URL}/users/me`, () => new Promise(() => {})));
    renderWithProviders(<GeneralHarness />, { withAuth: true });
    expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("combobox", { name: "Preferred currency" })
    ).toBeDisabled();
    expect(screen.getByText("Member since").parentElement).toHaveTextContent(
      "Loading..."
    );
  });

  it("edits the account email directly in General", async () => {
    mockBaseline();
    renderWithProviders(<GeneralHarness />, { withAuth: true });
    await waitFor(() =>
      expect(screen.getByLabelText("Email")).toHaveValue("jane@example.com")
    );
    await userEvent.setup().type(screen.getByLabelText("Email"), "x");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("shows the plan with a link to the Subscription tab", async () => {
    mockBaseline();
    renderWithProviders(<GeneralHarness />, { withAuth: true });
    expect(await screen.findByText("Free")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage plan" })).toHaveAttribute(
      "href",
      "/?tab=subscription"
    );
  });

  it("shows preferred currency and member since in General", async () => {
    mockBaseline({ ...baseUser, preferredCurrency: "USD" });
    renderWithProviders(<GeneralHarness />, { withAuth: true });
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "Preferred currency" })
      ).toHaveValue("USD — US Dollar")
    );
    expect(screen.getByText("Member since")).toBeInTheDocument();
  });

  it("saves currency edits through the view header", async () => {
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

  it("renders a child section below the details without touching the draft", async () => {
    mockBaseline();
    renderWithProviders(
      <GeneralHarness>
        <p>appended section</p>
      </GeneralHarness>,
      { withAuth: true }
    );
    const details = (await screen.findByText("Member since")).closest("dl")!;
    const child = screen.getByText("appended section");
    expect(
      details.compareDocumentPosition(child) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
  });

  it("renders the financial overview section", async () => {
    mockBaseline();
    server.use(
      http.get(
        `${API_URL}/reports/financial-overview`,
        () => new Promise(() => {})
      )
    );
    renderWithProviders(<GeneralHarness />, { withAuth: true });
    expect(
      await screen.findByRole("heading", { name: "Financial overview" })
    ).toBeInTheDocument();
  });
});
