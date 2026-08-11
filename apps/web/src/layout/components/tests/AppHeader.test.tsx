import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { server } from "../../../tests/mocks/server";
import { AppHeader } from "../AppHeader";

const API_URL = "http://localhost:4000";

describe("AppHeader", () => {
  it("renders the mobile-only brand link and the notifications bell", async () => {
    server.use(
      http.get(`${API_URL}/notifications/unread-count`, () => HttpResponse.json({ count: 0 })),
      http.get(`${API_URL}/transactions/imported/pending-count`, () =>
        HttpResponse.json({ count: 0 })
      )
    );

    renderWithProviders(<AppHeader />);

    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument()
    );
  });
});
