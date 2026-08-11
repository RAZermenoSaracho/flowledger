import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "../../tests/utils/renderWithProviders";
import { GoogleOAuthButton } from "../GoogleOAuthButton";

describe("GoogleOAuthButton", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, href: "" }
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation
    });
  });

  it("renders a 'Continue with Google' button", () => {
    renderWithProviders(<GoogleOAuthButton />);
    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
  });

  it("redirects to the Google OAuth URL with the default redirect on click", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoogleOAuthButton />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(window.location.href).toBe(
      "http://localhost:4000/auth/google?redirect=%2F"
    );
  });

  it("encodes a custom redirect path into the OAuth URL", async () => {
    const user = userEvent.setup();
    renderWithProviders(<GoogleOAuthButton redirect="/transactions" />);

    await user.click(screen.getByRole("button", { name: /continue with google/i }));

    expect(window.location.href).toBe(
      "http://localhost:4000/auth/google?redirect=%2Ftransactions"
    );
  });
});
