import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL, baseUser } from "../../tests/profileFixtures";
import { ChangePasswordDialog } from "../ChangePasswordDialog";

async function fill(current: string, next: string, confirm: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Current password"), current);
  await user.type(screen.getByLabelText("New password"), next);
  await user.type(screen.getByLabelText("Confirm new password"), confirm);
  await user.click(screen.getByRole("button", { name: "Change password" }));
}

describe("ChangePasswordDialog", () => {
  it("opens modally with focus on the current password field", () => {
    renderWithProviders(<ChangePasswordDialog onCancel={vi.fn()} onChanged={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Change password" })).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toHaveFocus();
  });

  it("shows a mismatch error without calling the server", async () => {
    const onChanged = vi.fn();
    renderWithProviders(<ChangePasswordDialog onCancel={vi.fn()} onChanged={onChanged} />);
    await fill("oldpassword", "newpassword123", "different123");
    expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("shows the server error inline", async () => {
    server.use(
      http.patch(`${API_URL}/users/me/password`, () =>
        HttpResponse.json({ message: "Current password is incorrect" }, { status: 401 })
      )
    );
    renderWithProviders(<ChangePasswordDialog onCancel={vi.fn()} onChanged={vi.fn()} />);
    await fill("wrong", "newpassword123", "newpassword123");
    expect(await screen.findByText("Current password is incorrect")).toBeInTheDocument();
  });

  it("calls onChanged on success", async () => {
    server.use(
      http.patch(`${API_URL}/users/me/password`, () => HttpResponse.json({ user: baseUser }))
    );
    const onChanged = vi.fn();
    renderWithProviders(<ChangePasswordDialog onCancel={vi.fn()} onChanged={onChanged} />);
    await fill("oldpassword", "newpassword123", "newpassword123");
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("calls onCancel from the Cancel button", async () => {
    const onCancel = vi.fn();
    renderWithProviders(<ChangePasswordDialog onCancel={onCancel} onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
