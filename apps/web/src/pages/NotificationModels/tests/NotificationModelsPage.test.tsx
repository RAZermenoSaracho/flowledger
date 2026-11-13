import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Navigate, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { makeLibraryEntry, makeNotificationModel, notificationModelHandlers, notificationPage } from "../../../tests/mocks/handlers";
import { server } from "../../../tests/mocks/server";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { NotificationModelsPage } from "../NotificationModelsPage";

function renderPage(route = "/notification-models") {
  return renderWithProviders(
    <Routes>
      <Route path="/notification-models" element={<NotificationModelsPage />} />
      <Route path="/notification-models/new" element={<p>New model page</p>} />
      <Route path="/notification-models/:id" element={<p>Model page</p>} />
    </Routes>,
    { route }
  );
}

describe("NotificationModelsPage", () => {
  it("lists models with active badge, visibility and last run status in a 375px window", async () => {
    window.innerWidth = 375;
    server.use(
      ...notificationModelHandlers({
        model: makeNotificationModel({ name: "Plata", isActive: true, visibility: "public", publication: { published: true, latestVersion: 3, publishedAt: "2026-11-02T00:00:00.000Z" }, lastRunStatus: "failed" })
      })
    );
    renderPage();

    expect(await screen.findByRole("link", { name: "Plata" })).toHaveAttribute("href", "/notification-models/nm-1");
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Published · v3")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("never shows a Public badge for a public model without a version", async () => {
    server.use(...notificationModelHandlers({ model: makeNotificationModel({ visibility: "public" }) }));
    renderPage();
    await screen.findByRole("link", { name: "Plata" });
    expect(screen.queryByText(/^public$|^published · v/i)).not.toBeInTheDocument();
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

  it("renders both section tabs with My Models selected by default", async () => {
    server.use(...notificationModelHandlers());
    renderPage();
    expect(screen.getByRole("tab", { name: "My Models" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Public Models" })).toHaveAttribute("aria-selected", "false");
    expect(await screen.findByRole("link", { name: "Plata" })).toBeInTheDocument();
  });

  it("selects Public Models from ?tab=public and switches with click and arrow keys", async () => {
    server.use(...notificationModelHandlers(), http.get("http://localhost:4000/notification-library", () => HttpResponse.json({ data: [makeLibraryEntry()] })));
    const user = userEvent.setup();
    renderPage("/notification-models?tab=public");
    expect(screen.getByRole("tab", { name: "Public Models" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Plata shared")).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "My Models" }));
    expect(screen.getByRole("tab", { name: "My Models" })).toHaveAttribute("aria-selected", "true");

    screen.getByRole("tab", { name: "My Models" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Public Models" })).toHaveAttribute("aria-selected", "true");
  });

  it("redirects the legacy /notification-library URL to the public tab", () => {
    server.use(...notificationModelHandlers());
    renderWithProviders(
      <Routes>
        <Route path="/notification-library" element={<Navigate to="/notification-models?tab=public" replace />} />
        <Route path="/notification-models" element={<NotificationModelsPage />} />
      </Routes>,
      { route: "/notification-library" }
    );
    expect(screen.getByRole("tab", { name: "Public Models" })).toHaveAttribute("aria-selected", "true");
  });
});
