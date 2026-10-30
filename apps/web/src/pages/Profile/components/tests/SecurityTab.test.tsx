import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { API_URL } from "../../tests/profileFixtures";
import { SecurityTab } from "../SecurityTab";

describe("SecurityTab", () => {
  it("renders the four sections with the client instructions collapsed", async () => {
    server.use(
      http.get(`${API_URL}/users/me/api-keys`, () => HttpResponse.json({ apiKeys: [] })),
      http.get(`${API_URL}/users/me/oauth-grants`, () => HttpResponse.json({ grants: [] }))
    );
    renderWithProviders(<SecurityTab />);
    expect(screen.getByRole("heading", { name: "Password" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Personal API keys" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connected apps" })).toBeInTheDocument();
    expect(await screen.findByText("No connected apps.")).toBeInTheDocument();
    const summary = screen.getByText("Connect an AI client (ChatGPT, Claude Code)");
    expect(summary.closest("details")).not.toHaveAttribute("open");
  });
});
