import { DEFAULT_NOTIFICATION_RULES, generateNotificationCode } from "@flowledger/shared";
import { EditorView } from "@codemirror/view";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeNotificationModel, makeNotificationRun, notificationModelHandlers } from "../../../tests/mocks/handlers";
import { server } from "../../../tests/mocks/server";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { NotificationModelDetailPage } from "../NotificationModelDetailPage";

const API = "http://localhost:4000";

function renderPage(route = "/notification-models/nm-1") {
  return renderWithProviders(
    <Routes>
      <Route path="/notification-models" element={<p>Models list</p>} />
      <Route path="/notification-models/new" element={<NotificationModelDetailPage />} />
      <Route path="/notification-models/:id" element={<NotificationModelDetailPage />} />
    </Routes>,
    { route }
  );
}

function editCode(insert: string) {
  const view = EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!;
  act(() => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert } }));
}

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

describe("NotificationModelDetailPage", () => {
  it("offers the five tabs in order and keeps one draft across them, saved in a single request", async () => {
    server.use(...notificationModelHandlers());
    let body: unknown;
    server.use(
      http.put(`${API}/notification-models/nm-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ model: makeNotificationModel() });
      })
    );
    const user = userEvent.setup();
    renderPage();

    const nameInput = await screen.findByLabelText("Name");
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["Form", "Code", "Playground", "Queue", "Logs"]);

    await user.clear(nameInput);
    await user.type(nameInput, "Renamed");
    await user.click(screen.getByRole("tab", { name: "Code" }));
    editCode("def process(text, ctx):\n    return skip('y')\n");
    await user.click(screen.getByRole("tab", { name: "Form" }));
    expect(screen.getByLabelText("Name")).toHaveValue("Renamed");

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body).toEqual({ name: "Renamed", code: "def process(text, ctx):\n    return skip('y')\n" }));
  });

  it("shows the endpoint URL, request example and own-records binding options", async () => {
    server.use(...notificationModelHandlers());
    renderPage();

    expect(await screen.findByText("http://localhost:4000/v1/notification-models/nm-1/notifications")).toBeInTheDocument();
    expect(screen.getByText(/Authorization: Bearer <ingest key>/)).toBeInTheDocument();
    const bound = screen.getByLabelText("Bound account for card");
    expect(await within(bound).findByRole("option", { name: "Plata card" })).toBeInTheDocument();
    expect(within(bound).queryByRole("option", { name: "Old" })).not.toBeInTheDocument();
  });

  it("opens straight on the tab in the URL", async () => {
    server.use(...notificationModelHandlers());
    renderPage("/notification-models/nm-1?tab=code");
    expect(await screen.findByRole("button", { name: "Check" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
  });

  it("starts a new model from the default rules' code", async () => {
    server.use(...notificationModelHandlers());
    renderPage("/notification-models/new?tab=code");
    const view = await waitFor(() => {
      const element = document.querySelector(".cm-editor") as HTMLElement;
      expect(element).not.toBeNull();
      return EditorView.findFromDOM(element)!;
    });
    expect(view.state.doc.toString()).toBe(generateNotificationCode(DEFAULT_NOTIFICATION_RULES));
  });

  it("checks code and lists errors by line, then lists the helper reference", async () => {
    server.use(
      ...notificationModelHandlers(),
      http.post(`${API}/notification-models/validate`, () => HttpResponse.json({ errors: [{ line: 1, col: 1, message: "import is not allowed" }] }))
    );
    const user = userEvent.setup();
    renderPage("/notification-models/nm-1?tab=code");
    await user.click(await screen.findByRole("button", { name: "Check" }));
    expect(await screen.findByText("Line 1: import is not allowed")).toBeInTheDocument();
    expect(screen.getByText("Function reference")).toBeInTheDocument();
    expect(screen.getByText("skip(reason)")).toBeInTheDocument();
  });

  it("shows a save error with its line and the unbound slots on activation", async () => {
    server.use(...notificationModelHandlers());
    const user = userEvent.setup();
    server.use(
      http.put(`${API}/notification-models/nm-1`, async ({ request }) => {
        const body = (await request.json()) as { code?: string };
        return body.code !== undefined
          ? HttpResponse.json({ message: "Script is invalid", errors: [{ line: 2, col: 1, message: "bad" }] }, { status: 400 })
          : HttpResponse.json({ message: "Required slots are not bound: card", unboundSlots: ["card"] }, { status: 400 });
      })
    );
    renderPage();
    await user.click(await screen.findByLabelText("Active"));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findAllByText("Required slots are not bound: card")).length).toBeGreaterThan(0);

    await user.click(screen.getByLabelText("Active"));
    await user.click(screen.getByRole("tab", { name: "Code" }));
    editCode("x = (");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findAllByText(/line 2: bad/)).length).toBeGreaterThan(0);
  });

  it("runs the playground against the unsaved draft without saving", async () => {
    server.use(...notificationModelHandlers());
    let testBody: unknown;
    let saved = false;
    server.use(
      http.put(`${API}/notification-models/nm-1`, () => {
        saved = true;
        return HttpResponse.json({ model: makeNotificationModel() });
      }),
      http.post(`${API}/notification-models/nm-1/test`, async ({ request }) => {
        testBody = await request.json();
        return HttpResponse.json({
          outcome: "proposal",
          transactionPreview: { name: "OXXO", amount: "10.00" },
          stdout: "hello"
        });
      })
    );
    const user = userEvent.setup();
    renderPage("/notification-models/nm-1?tab=code");
    await screen.findByRole("button", { name: "Check" });
    editCode("print('edited')");
    await user.click(screen.getByRole("tab", { name: "Playground" }));
    await user.type(screen.getByLabelText("Notification text"), "Compraste $10");
    await user.click(screen.getByRole("button", { name: "Run" }));

    expect(await screen.findByText("Transaction preview")).toBeInTheDocument();
    expect(screen.getByText("Nothing was created.")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(testBody).toMatchObject({ text: "Compraste $10", code: "print('edited')", settings: {} });
    expect(saved).toBe(false);
  });

  it("shows playground errors with their line", async () => {
    server.use(
      http.post(`${API}/notification-models/nm-1/test`, () =>
        HttpResponse.json({ outcome: "error", error: { message: "ValueError: no amount found", line: 7 }, stdout: "" })
      ),
      ...notificationModelHandlers()
    );
    const user = userEvent.setup();
    renderPage("/notification-models/nm-1?tab=playground");
    await user.type(await screen.findByLabelText("Notification text"), "x");
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText(/ValueError: no amount found \(line 7\)/)).toBeInTheDocument();
  });

  it("shows the read-only queue with positions and no action buttons, and the logs", async () => {
    server.use(
      ...notificationModelHandlers({
        queue: [makeNotificationRun({ id: "a" }), makeNotificationRun({ id: "b", text: "second" })],
        logs: [makeNotificationRun({ id: "c", status: "completed", finishedAt: "2026-11-13T10:01:00.000Z", text: "log text" })]
      })
    );
    const user = userEvent.setup();
    renderPage("/notification-models/nm-1?tab=queue");
    expect(await screen.findByText("Position 2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel|retry|reorder|delete|start|stop/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Logs" }));
    expect(await screen.findByText("log text")).toBeInTheDocument();
  });

  it("confirms delete stating the pending runs, then returns to the list", async () => {
    server.use(...notificationModelHandlers({ model: makeNotificationModel({ queued: 2, processing: 1 }) }));
    let deleted = false;
    server.use(
      http.delete(`${API}/notification-models/nm-1`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      })
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Name");
    await user.click(screen.getByRole("button", { name: "Record actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("3 pending runs"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("removes its queue and logs"));
    expect(await screen.findByText("Models list")).toBeInTheDocument();
    expect(deleted).toBe(true);
  });

  it("publishes only after a confirm that lists the published fields", async () => {
    server.use(...notificationModelHandlers());
    let published = 0;
    server.use(
      http.post(`${API}/notification-models/nm-1/publish`, () => {
        published += 1;
        return HttpResponse.json({ model: makeNotificationModel() });
      })
    );
    const user = userEvent.setup();
    renderPage();
    await screen.findByLabelText("Name");

    vi.mocked(window.confirm).mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: "Record actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Publish" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/name, description, code, slots and settings.*Bindings are not published/));
    expect(published).toBe(0);

    await user.click(screen.getByRole("button", { name: "Record actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Publish" }));
    await waitFor(() => expect(published).toBe(1));
  });

  it("shows a read-only publication status and offers Unpublish only when published", async () => {
    server.use(...notificationModelHandlers());
    const user = userEvent.setup();
    const view = renderPage();
    await screen.findByLabelText("Name");
    expect(screen.getByText("Not published")).toBeInTheDocument();
    expect(screen.queryByLabelText("Visibility")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Record actions" }));
    expect(screen.queryByRole("menuitem", { name: "Unpublish" })).not.toBeInTheDocument();
    view.unmount();

    let body: unknown = null;
    server.use(
      ...notificationModelHandlers({ model: makeNotificationModel({ visibility: "public", publication: { published: true, latestVersion: 2, publishedAt: "2026-11-02T00:00:00.000Z" } }) }),
      http.put(`${API}/notification-models/nm-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ model: makeNotificationModel() });
      })
    );
    renderPage();
    await screen.findByLabelText("Name");
    expect(screen.getAllByText("Published · v2").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: "Record actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Unpublish" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("disappear from the library"));
    await waitFor(() => expect(body).toEqual({ visibility: "private" }));
  });

  it("shows not found for an unknown model", async () => {
    server.use(
      ...notificationModelHandlers(),
      http.get(`${API}/notification-models/missing`, () => HttpResponse.json({ message: "Notification model not found" }, { status: 404 }))
    );
    renderPage("/notification-models/missing");
    expect(await screen.findByText("Notification model not found")).toBeInTheDocument();
  });
});

describe("NotificationModelDetailPage processing rules", () => {
  const CANONICAL = generateNotificationCode(DEFAULT_NOTIFICATION_RULES);
  const CUSTOM = "def process(text, ctx):\n    # mine\n    return skip('x')\n";
  const parseWith = (body: unknown, status = 200) =>
    http.post(`${API}/notification-models/parse-rules`, () => HttpResponse.json(body as object, { status }));
  const currentCode = () => EditorView.findFromDOM(document.querySelector(".cm-editor") as HTMLElement)!.state.doc.toString();

  function renderModel(code: string, ...handlers: ReturnType<typeof parseWith>[]) {
    server.use(...handlers, ...notificationModelHandlers({ model: makeNotificationModel({ code }) }));
    return renderPage();
  }

  it("shows the default rule on a new model", async () => {
    server.use(...notificationModelHandlers());
    renderPage("/notification-models/new");
    expect(await screen.findByLabelText("Rule 1 label")).toHaveValue("Purchase");
    expect(screen.queryByText(/rewrites the code/)).not.toBeInTheDocument();
  });

  it("rewrites the draft code as rules are built, without saving, and keeps it across tabs", async () => {
    let saved = false;
    server.use(http.put(`${API}/notification-models/nm-1`, () => ((saved = true), HttpResponse.json({ model: makeNotificationModel() }))));
    const user = userEvent.setup();
    renderModel(CANONICAL);
    await user.click(await screen.findByRole("button", { name: "Add rule" }));
    await user.click(screen.getByRole("tab", { name: "Code" }));
    expect(currentCode()).toContain('"keyword" in t.lower()');
    await user.click(screen.getByRole("tab", { name: "Form" }));
    expect(await screen.findByLabelText("Rule 2 label")).toBeInTheDocument();
    expect(saved).toBe(false);
  });

  it("re-reads edited code when returning to Form", async () => {
    const user = userEvent.setup();
    renderModel(CANONICAL);
    await screen.findByLabelText("Rule 1 label");
    await user.click(screen.getByRole("tab", { name: "Code" }));
    editCode(CUSTOM);
    server.use(parseWith({ rules: { ...DEFAULT_NOTIFICATION_RULES, fallbackReason: "from code" } }));
    await user.click(screen.getByRole("tab", { name: "Form" }));
    expect(await screen.findByLabelText("Otherwise skip, with reason")).toHaveValue("from code");
    expect(screen.getByText(/rewrites the code in a standard form/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Code" }));
    expect(currentCode()).toBe(CUSTOM);
  });

  it("explains unsupported code, leaves it untouched, and replaces it only after confirming", async () => {
    const user = userEvent.setup();
    renderModel(CUSTOM, parseWith({ unsupported: [{ line: 2, message: "loops are not supported" }] }));
    expect(await screen.findByText(/can't represent/)).toBeInTheDocument();
    expect(screen.getByText("Line 2: loops are not supported")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add rule" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Replace with visual rules" }));
    expect(screen.getByText("This replaces your entire script, including comments and unsupported logic. This cannot be undone after saving.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("tab", { name: "Code" }));
    expect(currentCode()).toBe(CUSTOM);

    server.use(parseWith({ unsupported: [{ line: 2, message: "loops are not supported" }] }));
    await user.click(screen.getByRole("tab", { name: "Form" }));
    await user.click(await screen.findByRole("button", { name: "Replace with visual rules" }));
    await user.click(screen.getByRole("button", { name: "Replace" }));
    expect(await screen.findByLabelText("Rule 1 label")).toHaveValue("Purchase");
    await user.click(screen.getByRole("tab", { name: "Code" }));
    expect(currentCode()).toBe(CANONICAL);
  });

  it("shows syntax errors without rules", async () => {
    renderModel(CUSTOM, parseWith({ errors: [{ line: 3, col: 1, message: "invalid syntax" }] }));
    expect(await screen.findByText("Line 3: invalid syntax")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add rule" })).not.toBeInTheDocument();
  });

  it("saves the generated code and shows the same rules after reload", async () => {
    let body: { code?: string } = {};
    server.use(
      http.put(`${API}/notification-models/nm-1`, async ({ request }) => {
        body = (await request.json()) as { code?: string };
        return HttpResponse.json({ model: makeNotificationModel({ code: body.code }) });
      })
    );
    const user = userEvent.setup();
    renderModel(CANONICAL);
    const fallback = await screen.findByLabelText("Otherwise skip, with reason");
    await user.clear(fallback);
    await user.type(fallback, "other");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body.code).toBe(generateNotificationCode({ ...DEFAULT_NOTIFICATION_RULES, fallbackReason: "other" })));
  });

  it("does not write code while an edit is invalid", async () => {
    const user = userEvent.setup();
    renderModel(CANONICAL);
    const fallback = await screen.findByLabelText("Otherwise skip, with reason");
    await user.clear(fallback);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Code" }));
    expect(currentCode()).toBe(CANONICAL);
  });
});
