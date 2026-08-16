import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import type { User } from "../../../types/users.types";
import { ProfilePage } from "../ProfilePage";

const API_URL = "http://localhost:4000";

const baseUser: User = {
  id: "user-1",
  name: "Jane Doe",
  email: "jane@example.com",
  planType: "free",
  mobileSidebarSide: "left",
  preferredCurrency: null,
  createdAt: "2024-01-15T00:00:00.000Z",
  updatedAt: "2024-01-15T00:00:00.000Z"
};

const currencies = {
  currencies: [{ code: "USD", name: "US Dollar", type: "fiat" }],
  fiat: [{ code: "USD", name: "US Dollar" }],
  crypto: []
};

function mockBaseline(user: User = baseUser) {
  server.use(
    http.post(`${API_URL}/auth/refresh`, () => new HttpResponse(null, { status: 401 })),
    http.get(`${API_URL}/users/me`, () => HttpResponse.json({ user })),
    http.get(`${API_URL}/currencies`, () => HttpResponse.json(currencies))
  );
}

function renderProfile() {
  return renderWithProviders(<ProfilePage />, { withAuth: true, withTheme: true });
}

describe("ProfilePage", () => {
  it("shows 'Loading...' details before the profile query resolves", () => {
    mockBaseline();
    renderProfile();

    expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
  });

  it("renders profile details once loaded, with 'Not set' for no preferred currency", async () => {
    mockBaseline();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
  });

  it("shows the resolved currency name for a known fiat preferredCurrency", async () => {
    mockBaseline({ ...baseUser, preferredCurrency: "USD" });
    renderProfile();

    await waitFor(() => expect(screen.getByText("USD — US Dollar")).toBeInTheDocument());
  });

  it("opens the edit form pre-filled with current values, and cancel closes it", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Edit Profile" }));

    expect(screen.getByLabelText("Name")).toHaveValue("Jane Doe");
    expect(screen.getByLabelText("Email")).toHaveValue("jane@example.com");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("replaces the read-only preview with the edit form instead of showing both", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    expect(screen.getByRole("heading", { name: "Profile and account" })).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit Profile" }));

    expect(
      screen.queryByRole("heading", { name: "Profile and account" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Free")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Profile details" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: "Profile and account" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Profile details" })
    ).not.toBeInTheDocument();
  });

  it("saves profile changes and shows a success message", async () => {
    mockBaseline();
    let updatedBody: unknown;
    server.use(
      http.patch(`${API_URL}/users/me`, async ({ request }) => {
        updatedBody = await request.json();
        return HttpResponse.json({ user: { ...baseUser, name: "Jane Smith" } });
      })
    );
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Edit Profile" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Jane Smith");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(screen.getByText("Profile updated")).toBeInTheDocument());
    expect(updatedBody).toMatchObject({ name: "Jane Smith" });
  });

  it("shows an error message when saving the profile fails", async () => {
    mockBaseline();
    server.use(
      http.patch(`${API_URL}/users/me`, () =>
        HttpResponse.json({ message: "Email already in use" }, { status: 409 })
      )
    );
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Edit Profile" }));
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    await waitFor(() => expect(screen.getByText("Email already in use")).toBeInTheDocument());
  });

  it("changes the password and clears the fields on success", async () => {
    mockBaseline();
    server.use(
      http.patch(`${API_URL}/users/me/password`, () => HttpResponse.json({ user: baseUser }))
    );
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Edit Profile" }));

    await user.type(screen.getByLabelText("Current password"), "oldpassword");
    await user.type(screen.getByLabelText("New password"), "newpassword123");
    await user.type(screen.getByLabelText("Confirm new password"), "newpassword123");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => expect(screen.getByText("Password updated")).toBeInTheDocument());
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });

  it("shows an error when the password change fails", async () => {
    mockBaseline();
    server.use(
      http.patch(`${API_URL}/users/me/password`, () =>
        HttpResponse.json({ message: "Current password is incorrect" }, { status: 401 })
      )
    );
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Edit Profile" }));
    await user.type(screen.getByLabelText("Current password"), "wrong");
    await user.type(screen.getByLabelText("New password"), "newpassword123");
    await user.type(screen.getByLabelText("Confirm new password"), "newpassword123");
    await user.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() =>
      expect(screen.getByText("Current password is incorrect")).toBeInTheDocument()
    );
  });

  it("shows an 'Upgrade' action on the free plan and switches to flowledger_one on click", async () => {
    mockBaseline();
    // updatePlan's onSuccess invalidates the ["me"] query, triggering a
    // GET /users/me refetch — that handler must reflect the change too,
    // or the refetch would silently revert the optimistic plan update.
    let currentUser = baseUser;
    server.use(
      http.get(`${API_URL}/users/me`, () => HttpResponse.json({ user: currentUser })),
      http.patch(`${API_URL}/users/me/plan`, () => {
        currentUser = { ...baseUser, planType: "flowledger_one" };
        return HttpResponse.json({ user: currentUser });
      })
    );
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Upgrade" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Downgrade" })).toBeInTheDocument());
  });

  it("shows an error when changing plan fails", async () => {
    mockBaseline();
    server.use(
      http.patch(`${API_URL}/users/me/plan`, () =>
        HttpResponse.json({ message: "Plan change unavailable" }, { status: 400 })
      )
    );
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("button", { name: "Upgrade" }));

    await waitFor(() => expect(screen.getByText("Plan change unavailable")).toBeInTheDocument());
  });

  it("toggles the mobile sidebar side via the switch", async () => {
    mockBaseline();
    server.use(
      http.patch(`${API_URL}/users/me/sidebar-side`, () =>
        HttpResponse.json({ user: { ...baseUser, mobileSidebarSide: "right" } })
      )
    );
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    await user.click(screen.getByRole("switch", { name: "Use right sidebar drawer" }));

    await waitFor(() => expect(screen.getByText("Right sidebar drawer")).toBeInTheDocument());
  });

  it("changes the theme preference via the Theme select", async () => {
    mockBaseline();
    const user = userEvent.setup();
    renderProfile();

    await waitFor(() => expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0));
    await user.selectOptions(screen.getByLabelText("Theme"), "dark");

    expect(screen.getByLabelText("Theme")).toHaveValue("dark");
  });

  it("shows initials instead of an avatar image when the user has no avatarUrl", async () => {
    mockBaseline();
    renderProfile();

    await waitFor(() => expect(screen.getByText("JD")).toBeInTheDocument());
  });
});
