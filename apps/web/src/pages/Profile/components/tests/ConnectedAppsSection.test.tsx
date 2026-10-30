import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { ConnectedAppsSection } from "../ConnectedAppsSection";

const API = "http://localhost:4000";
const grant = {
  id: "g1", clientName: "ChatGPT", redirectHost: "chatgpt.com", scopes: ["read", "write"],
  createdAt: "2026-01-01T00:00:00.000Z", expiresAt: null, lastUsedAt: null
};

describe("ConnectedAppsSection", () => {
  it("shows the empty state", async () => {
    server.use(http.get(`${API}/users/me/oauth-grants`, () => HttpResponse.json({ grants: [] })));
    renderWithProviders(<ConnectedAppsSection />);
    expect(await screen.findByText("No connected apps.")).toBeInTheDocument();
  });

  it("lists grants and revokes after confirmation naming the app", async () => {
    let revoked = false;
    server.use(
      http.get(`${API}/users/me/oauth-grants`, () => HttpResponse.json({ grants: revoked ? [] : [grant] })),
      http.delete(`${API}/users/me/oauth-grants/g1`, () => {
        revoked = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderWithProviders(<ConnectedAppsSection />);

    expect(await screen.findByText("ChatGPT")).toBeInTheDocument();
    expect(screen.getByText(/chatgpt.com · Read \+ Write · Connected .*Never expires · Never used/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revoke" }));
    expect(screen.getByText(/Disconnect "ChatGPT"\?/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(await screen.findByText("ChatGPT disconnected.")).toBeInTheDocument();
    expect(await screen.findByText("No connected apps.")).toBeInTheDocument();
  });
});
