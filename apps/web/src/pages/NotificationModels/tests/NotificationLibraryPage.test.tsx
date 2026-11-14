import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { makeLibraryEntry, notificationModelHandlers, makeNotificationModel } from "../../../tests/mocks/handlers";
import { server } from "../../../tests/mocks/server";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { NotificationLibraryPage } from "../NotificationLibraryPage";

const API = "http://localhost:4000";

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/notification-library" element={<NotificationLibraryPage />} />
      <Route path="/notification-models/:id" element={<p>Copy page</p>} />
    </Routes>,
    { route: "/notification-library" }
  );
}

describe("NotificationLibraryPage", () => {
  it("lists entries with author and version, shows code read-only on demand, and installs into the copy", async () => {
    let installed = false;
    server.use(
      ...notificationModelHandlers(),
      http.get(`${API}/notification-library`, () => HttpResponse.json({ data: [makeLibraryEntry()] })),
      http.get(`${API}/notification-library/lib-1`, () => HttpResponse.json({ entry: makeLibraryEntry({ code: "def process(text, ctx):\n    pass\n" }) })),
      http.post(`${API}/notification-library/lib-1/install`, () => {
        installed = true;
        return HttpResponse.json({ model: makeNotificationModel({ id: "copy-1" }) }, { status: 201 });
      })
    );
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Plata shared")).toBeInTheDocument();
    expect(screen.getByText("Version 2 · by @ana")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View code" }));
    expect(await screen.findByLabelText("Code of Plata shared")).toHaveAttribute("contenteditable", "false");

    await user.click(screen.getByRole("button", { name: "Install" }));
    expect(await screen.findByText("Copy page")).toBeInTheDocument();
    expect(installed).toBe(true);
  });

  it("lists slots, hides Install for own entries and links to an installed copy", async () => {
    server.use(
      ...notificationModelHandlers(),
      http.get(`${API}/notification-library`, () =>
        HttpResponse.json({
          data: [
            makeLibraryEntry({ modelId: "own", name: "Mine", isOwn: true }),
            makeLibraryEntry({ modelId: "got", name: "Got it", installedModelId: "copy-9" }),
            makeLibraryEntry({ modelId: "new", name: "Fresh" })
          ]
        })
      )
    );
    renderPage();

    await screen.findByText("Mine");
    expect(screen.getAllByText("Slots: Card (account)")).toHaveLength(3);
    expect(screen.getByText("Your model")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Installed — Open" })).toHaveAttribute("href", "/notification-models/copy-9");
    expect(screen.getAllByRole("button", { name: "Install" })).toHaveLength(1);
  });

  it("shows an install error inline", async () => {
    server.use(
      ...notificationModelHandlers(),
      http.get(`${API}/notification-library`, () => HttpResponse.json({ data: [makeLibraryEntry()] })),
      http.post(`${API}/notification-library/lib-1/install`, () => HttpResponse.json({ message: "You cannot install your own model" }, { status: 400 }))
    );
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Install" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You cannot install your own model");
  });

  it("shows a load error", async () => {
    server.use(...notificationModelHandlers(), http.get(`${API}/notification-library`, () => HttpResponse.json({ message: "Boom" }, { status: 500 })));
    renderPage();
    expect(await screen.findByText("Boom")).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    server.use(http.get(`${API}/notification-library`, () => HttpResponse.json({ data: [] })), ...notificationModelHandlers());
    renderPage();
    expect(await screen.findByText("No models have been published yet.")).toBeInTheDocument();
  });
});
