import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL, baseUser } from "../../tests/profileFixtures";
import { PasswordSection } from "../PasswordSection";

describe("PasswordSection", () => {
  it("opens the dialog, confirms the change, closes it and returns focus to the trigger", async () => {
    server.use(
      http.patch(`${API_URL}/users/me/password`, () => HttpResponse.json({ user: baseUser }))
    );
    const user = userEvent.setup();
    renderWithProviders(<PasswordSection />);
    const trigger = screen.getByRole("button", { name: "Change password" });
    await user.click(trigger);
    await user.type(screen.getByLabelText("Current password"), "oldpassword");
    await user.type(screen.getByLabelText("New password"), "newpassword123");
    await user.type(screen.getByLabelText("Confirm new password"), "newpassword123");
    await user.click(screen.getAllByRole("button", { name: "Change password" })[1]!);
    await waitFor(() => expect(screen.getByText("Password updated")).toBeInTheDocument());
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("clears the fields when cancelled and reopened", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PasswordSection />);
    await user.click(screen.getByRole("button", { name: "Change password" }));
    await user.type(screen.getByLabelText("Current password"), "typed");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(screen.getByLabelText("Current password")).toHaveValue("");
  });
});
