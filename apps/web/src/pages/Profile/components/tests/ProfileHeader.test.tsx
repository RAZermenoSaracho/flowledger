import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { server } from "../../../../tests/mocks/server";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { getToken } from "../../../../services/auth.client";
import { API_URL, baseUser, mockBaseline } from "../../tests/profileFixtures";
import { FormView } from "../../../../components/FormView";
import { GeneralTab } from "../GeneralTab";
import { ProfileHeader } from "../ProfileHeader";
import { useProfileDetails } from "../../hooks/useProfileDetails";

function HeaderHarness({ withGeneral = true }: { withGeneral?: boolean }) {
  const profile = useProfileDetails();
  return (
    <FormView
      title="Profile"
      draft={profile.draft}
      onSave={profile.onSave}
      headerExtra={<ProfileHeader profile={profile} />}
    >
      {withGeneral ? <GeneralTab profile={profile} /> : null}
    </FormView>
  );
}

const render = (withGeneral = true) =>
  renderWithProviders(<HeaderHarness withGeneral={withGeneral} />, {
    withAuth: true
  });

describe("ProfileHeader", () => {
  it("renders disabled empty inputs before the profile resolves", () => {
    mockBaseline();
    render();
    expect(screen.getByLabelText("Name")).toBeDisabled();
    expect(screen.getByLabelText("Name")).toHaveValue("");
  });

  it("renders identity details with initials and without account summary fields", async () => {
    mockBaseline();
    render(false);
    expect(await screen.findByLabelText("Name")).toHaveValue("Jane Doe");
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
    expect(screen.queryByText("jane@example.com")).not.toBeInTheDocument();
    expect(screen.queryByText("Not set")).not.toBeInTheDocument();
    expect(screen.queryByText("Member since")).not.toBeInTheDocument();
    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Edit/ })
    ).not.toBeInTheDocument();
  });

  it("edits directly, shows Save/Cancel only when dirty, and Cancel restores", async () => {
    mockBaseline();
    const user = userEvent.setup();
    render();
    const input = await screen.findByLabelText("Name");
    await waitFor(() => expect(input).toHaveValue("Jane Doe"));
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" })
    ).not.toBeInTheDocument();
    await user.type(input, "x");
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Jane Doe");
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
  });

  it("Escape reverts the field", async () => {
    mockBaseline();
    const user = userEvent.setup();
    render();
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveValue("Jane Doe")
    );
    await user.type(screen.getByLabelText("Name"), "x{Escape}");
    expect(screen.getByLabelText("Name")).toHaveValue("Jane Doe");
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
  });

  it("blocks save and shows an error for an invalid email", async () => {
    mockBaseline();
    const user = userEvent.setup();
    render();
    const input = await screen.findByLabelText("Email");
    await waitFor(() => expect(input).toHaveValue("jane@example.com"));
    await user.clear(input);
    await user.type(input, "nope");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid email address"
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("saves the existing payload and updates the display", async () => {
    mockBaseline();
    let body: unknown;
    server.use(
      http.patch(`${API_URL}/users/me`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ user: { ...baseUser, name: "Jane Roe" } });
      })
    );
    const user = userEvent.setup();
    render();
    const input = await screen.findByLabelText("Name");
    await waitFor(() => expect(input).toHaveValue("Jane Doe"));
    await user.clear(input);
    await user.type(input, "Jane Roe");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveValue("Jane Roe")
    );
    expect(body).toEqual({
      name: "Jane Roe",
      email: "jane@example.com",
      preferredCurrency: null
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save" })
      ).not.toBeInTheDocument()
    );
  });

  it("asks for the current password on an email change, then replaces the token and saves the rest", async () => {
    mockBaseline();
    let emailBody: unknown;
    let profileBody: unknown;
    const changed = { ...baseUser, email: "new@example.com" };
    server.use(
      http.patch(`${API_URL}/auth/email`, async ({ request }) => {
        emailBody = await request.json();
        return HttpResponse.json({ token: "new-tok", user: changed });
      }),
      http.patch(`${API_URL}/users/me`, async ({ request }) => {
        profileBody = await request.json();
        return HttpResponse.json({ user: changed });
      })
    );
    const user = userEvent.setup();
    render();
    const input = await screen.findByLabelText("Email");
    await waitFor(() => expect(input).toHaveValue("jane@example.com"));
    await user.clear(input);
    await user.type(input, "new@example.com");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(profileBody).toBeUndefined();
    await user.type(await screen.findByLabelText("Current password"), "secret");
    await user.click(screen.getByRole("button", { name: "Change email" }));
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Current password")
      ).not.toBeInTheDocument()
    );
    expect(emailBody).toEqual({
      email: "new@example.com",
      currentPassword: "secret"
    });
    expect(profileBody).toMatchObject({ email: "new@example.com" });
    expect(getToken()).toBe("new-tok");
    await waitFor(() =>
      expect(screen.getByLabelText("Email")).toHaveValue("new@example.com")
    );
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
  });

  it("keeps the dialog open and shows the server message when the email is taken", async () => {
    mockBaseline();
    server.use(
      http.patch(`${API_URL}/auth/email`, () =>
        HttpResponse.json(
          { message: "Email already registered" },
          { status: 409 }
        )
      )
    );
    const user = userEvent.setup();
    render();
    const input = await screen.findByLabelText("Email");
    await waitFor(() => expect(input).toHaveValue("jane@example.com"));
    await user.clear(input);
    await user.type(input, "taken@example.com");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await user.type(await screen.findByLabelText("Current password"), "secret");
    await user.click(screen.getByRole("button", { name: "Change email" }));
    const dialog = screen.getByRole("dialog");
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Email already registered"
    );
  });

  it("previews a chosen avatar and uploads it on Save; beforeunload only while dirty", async () => {
    mockBaseline();
    URL.createObjectURL = () => "blob:preview";
    URL.revokeObjectURL = () => {};
    let uploaded = false;
    server.use(
      http.patch(`${API_URL}/users/me`, () =>
        HttpResponse.json({ user: baseUser })
      ),
      http.post(`${API_URL}/users/me/avatar`, () => {
        uploaded = true;
        return HttpResponse.json({ user: baseUser });
      })
    );
    const add = vi.spyOn(window, "addEventListener");
    const user = userEvent.setup();
    const { container } = render();
    await waitFor(() =>
      expect(screen.getByLabelText("Name")).toHaveValue("Jane Doe")
    );
    expect(add.mock.calls.some(([t]) => t === "beforeunload")).toBe(false);
    await user.upload(
      screen.getByLabelText("Profile picture file"),
      new File(["x"], "a.png", { type: "image/png" })
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "blob:preview"
    );
    expect(add.mock.calls.some(([t]) => t === "beforeunload")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(uploaded).toBe(true));
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Save" })
      ).not.toBeInTheDocument()
    );
    add.mockRestore();
  });
});
