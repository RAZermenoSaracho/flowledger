import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { server } from "../../../../tests/mocks/server";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL, baseUser, mockBaseline } from "../../tests/profileFixtures";
import { ProfileHeader } from "../ProfileHeader";

const render = () => renderWithProviders(<ProfileHeader />, { withAuth: true });

describe("ProfileHeader", () => {
  it("shows 'Loading...' before the profile resolves", () => {
    mockBaseline();
    render();
    expect(screen.getAllByText("Loading...").length).toBeGreaterThan(0);
  });

  it("renders identity details with initials and 'Not set' currency, without an Edit button", async () => {
    mockBaseline();
    render();
    expect(
      await screen.findByRole("button", { name: /Edit Name: Jane Doe/ })
    ).toBeInTheDocument();
    expect(screen.getByText("jane@example.com")).toBeInTheDocument();
    expect(screen.getByText("Not set")).toBeInTheDocument();
    expect(screen.getByText("JD")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit Profile" })
    ).not.toBeInTheDocument();
  });

  it("shows the resolved currency name for a fiat preferredCurrency", async () => {
    mockBaseline({ ...baseUser, preferredCurrency: "USD" });
    render();
    await waitFor(() =>
      expect(screen.getByText("USD — US Dollar")).toBeInTheDocument()
    );
  });

  it("enters edit mode on click, shows Save/Cancel only when dirty, and Cancel restores", async () => {
    mockBaseline();
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: /Edit Name/ }));
    const input = await screen.findByLabelText("Name");
    await waitFor(() => expect(input).toHaveFocus());
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
    await user.type(input, "x");
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      await screen.findByRole("button", { name: /Edit Name: Jane Doe/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
  });

  it("Escape reverts the field", async () => {
    mockBaseline();
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: /Edit Name/ }));
    await user.type(await screen.findByLabelText("Name"), "x{Escape}");
    expect(
      await screen.findByRole("button", { name: /Edit Name: Jane Doe/ })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
  });

  it("blocks save and shows an error for an invalid email", async () => {
    mockBaseline();
    const user = userEvent.setup();
    render();
    await user.click(await screen.findByRole("button", { name: /Edit Email/ }));
    const input = await screen.findByLabelText("Email");
    await user.clear(input);
    await user.type(input, "nope");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a valid email address"
    );
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("valid email");
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
    await user.click(await screen.findByRole("button", { name: /Edit Name/ }));
    const input = await screen.findByLabelText("Name");
    await user.clear(input);
    await user.type(input, "Jane Roe");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(
      await screen.findByRole("button", { name: /Edit Name: Jane Roe/ })
    ).toBeInTheDocument();
    expect(body).toEqual({
      name: "Jane Roe",
      email: "jane@example.com",
      preferredCurrency: null
    });
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
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
    await screen.findByRole("button", { name: /Edit Name/ });
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
