import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL } from "../../tests/profileFixtures";
import { GoogleSection } from "../GoogleSection";

function mockStatus(connected: boolean) {
  server.use(http.get(`${API_URL}/auth/google/link`, () => HttpResponse.json({ connected })));
}

function Harness() {
  const { search } = useLocation();
  return (
    <>
      <GoogleSection />
      <span data-testid="search">{search}</span>
    </>
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("GoogleSection", () => {
  it("shows connected state without a Connect button", async () => {
    mockStatus(true);
    renderWithProviders(<GoogleSection />);
    expect(await screen.findByText(/Google is connected/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Google" })).not.toBeInTheDocument();
  });

  it("starts the link flow with POST and navigates to the returned url", async () => {
    mockStatus(false);
    server.use(
      http.post(`${API_URL}/auth/google/link`, () => HttpResponse.json({ url: "https://g.example/consent" }))
    );
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    const user = userEvent.setup();
    renderWithProviders(<GoogleSection />);
    await user.click(await screen.findByRole("button", { name: "Connect Google" }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith("https://g.example/consent"));
  });

  it.each([
    ["connected", "status", "Google is now connected."],
    ["conflict", "alert", "may already be in use"],
    ["failed", "alert", "Google could not be connected"]
  ])("shows a message for googleLink=%s and removes the param", async (value, role, text) => {
    mockStatus(value === "connected");
    renderWithProviders(<Harness />, { route: `/profile?tab=security&googleLink=${value}` });
    expect(await screen.findByRole(role)).toHaveTextContent(text);
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent("?tab=security"));
    expect(screen.getByTestId("search")).not.toHaveTextContent("googleLink");
  });
});
