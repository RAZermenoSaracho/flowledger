import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { makeNotificationModel, notificationModelHandlers, notificationPage } from "../../../tests/mocks/handlers";
import { server } from "../../../tests/mocks/server";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { NotificationModelsPage } from "../NotificationModelsPage";

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/notification-models" element={<NotificationModelsPage />} />
      <Route path="/notification-models/new" element={<p>New model page</p>} />
      <Route path="/notification-models/:id" element={<p>Model page</p>} />
    </Routes>,
    { route: "/notification-models" }
  );
}

describe("NotificationModelsPage", () => {
  it("lists models with active badge, visibility and last run status in a 375px window", async () => {
    window.innerWidth = 375;
    server.use(
      ...notificationModelHandlers({
        model: makeNotificationModel({ name: "Plata", isActive: true, visibility: "public", lastRunStatus: "failed" })
      })
    );
    renderPage();

    expect(await screen.findByRole("link", { name: "Plata" })).toHaveAttribute("href", "/notification-models/nm-1");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("public")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("shows the empty state with a create link", async () => {
    server.use(http.get("http://localhost:4000/notification-models", () => HttpResponse.json(notificationPage([]))), ...notificationModelHandlers());
    renderPage();
    expect(await screen.findByText(/No notification models yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/notification-models/new");
  });

  it("opens a model from its row", async () => {
    server.use(...notificationModelHandlers());
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("link", { name: "Plata" }));
    expect(screen.getByText("Model page")).toBeInTheDocument();
  });

  it("navigates to /notification-models/new from Add model", async () => {
    server.use(...notificationModelHandlers());
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("link", { name: "Plata" });
    await user.click(screen.getAllByRole("button", { name: "Add model" })[0]!);
    expect(screen.getByText("New model page")).toBeInTheDocument();
  });
});
