import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makeLibraryEntry, makeNotificationModel, notificationModelHandlers } from "../../../../tests/mocks/handlers";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { ModelUpdateDialog } from "../ModelUpdateDialog";

const API = "http://localhost:4000";

const model = makeNotificationModel({
  sourceVersionId: "ver-1",
  code: "old code",
  bindings: { card: "acc-1" },
  update: { available: true, installedVersion: 1, latestVersion: 2, localCodeModified: true, sourceModelId: "lib-1", latestVersionId: "ver-2" }
});
const entry = makeLibraryEntry({
  code: "new code",
  slots: [
    { key: "card", kind: "account", label: "Card", required: true },
    { key: "savings", kind: "account", label: "Savings", required: true }
  ]
});

describe("ModelUpdateDialog", () => {
  it("shows both codes read-only, warns about local edits and requires a binding for new required slots", async () => {
    let body: unknown;
    server.use(
      ...notificationModelHandlers(),
      http.get(`${API}/notification-library/lib-1`, () => HttpResponse.json({ entry })),
      http.post(`${API}/notification-models/nm-1/update-from-source`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ model });
      })
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ModelUpdateDialog model={model} onClose={onClose} />);

    expect(screen.getByText(/changed this model's code locally/)).toBeInTheDocument();
    expect(await screen.findByText("new code")).toBeInTheDocument();
    expect(screen.getByText("old code")).toBeInTheDocument();
    expect(screen.getByLabelText("Current code")).toHaveAttribute("contenteditable", "false");
    expect(screen.queryByLabelText("Bind Card (card)")).not.toBeInTheDocument();

    const update = screen.getByRole("button", { name: "Update" });
    expect(update).toBeDisabled();
    await user.selectOptions(await screen.findByLabelText("Bind Savings (savings)"), await screen.findByRole("option", { name: "Plata card" }));
    await user.click(update);

    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toEqual({ versionId: "ver-2", bindings: { savings: "acc-1" } });
  });

  it("shows the server error and stays open", async () => {
    server.use(
      ...notificationModelHandlers(),
      http.get(`${API}/notification-library/lib-1`, () => HttpResponse.json({ entry: makeLibraryEntry({ code: "n" }) })),
      http.post(`${API}/notification-models/nm-1/update-from-source`, () =>
        HttpResponse.json({ message: "Required slots are not bound: card", unboundSlots: ["card"] }, { status: 400 })
      )
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<ModelUpdateDialog model={{ ...model, update: { ...model.update!, localCodeModified: false } }} onClose={onClose} />);
    await screen.findByText("n");
    expect(screen.queryByText(/changed this model's code locally/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByText("Required slots are not bound: card")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
