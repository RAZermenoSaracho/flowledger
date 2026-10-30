import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../tests/mocks/server";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { DeveloperPage } from "../DeveloperPage";

describe("DeveloperPage", () => {
  it("renders the keys and connect sections", async () => {
    server.use(http.get("http://localhost:4000/users/me/api-keys", () => HttpResponse.json({ apiKeys: [] })));
    server.use(http.get("http://localhost:4000/users/me/oauth-grants", () => HttpResponse.json({ grants: [] })));
    renderWithProviders(<DeveloperPage />);

    expect(screen.getByRole("heading", { name: "Personal API keys" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connected apps" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Connect an AI client" })).toBeInTheDocument();
    expect(await screen.findByText("No API keys yet.")).toBeInTheDocument();
  });
});
