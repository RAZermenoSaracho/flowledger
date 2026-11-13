import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { makeNotificationRun, notificationModelHandlers, notificationPage } from "../../../../tests/mocks/handlers";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { NotificationQueueList } from "../NotificationQueueList";

describe("NotificationQueueList", () => {
  it("shows positions for queued rows only, times and the text, with no action buttons", async () => {
    const long = "x".repeat(80);
    server.use(
      ...notificationModelHandlers({
        queue: [
          makeNotificationRun({ id: "r1", status: "processing", startedAt: "2026-11-13T10:00:05.000Z", text: "being processed" }),
          makeNotificationRun({ id: "r2", status: "queued", text: long }),
          makeNotificationRun({ id: "r3", status: "queued", text: "third" })
        ]
      })
    );
    renderWithProviders(<NotificationQueueList modelId="nm-1" />);

    expect(await screen.findByText("being processed")).toBeInTheDocument();
    expect(screen.getByText("Position 2")).toBeInTheDocument();
    expect(screen.getByText("Position 3")).toBeInTheDocument();
    expect(screen.queryByText("Position 1")).not.toBeInTheDocument();
    expect(screen.getByText("Processing")).toBeInTheDocument();
    expect(screen.getAllByText("Waiting")).toHaveLength(3);
    expect(screen.getByText("Started")).toBeInTheDocument();
    expect(screen.getByText(long)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cancel|retry|retire|delete|remove|start|stop|reorder/i })).not.toBeInTheDocument();
  });

  it("requests the first window and numbers from it", async () => {
    server.use(
      http.get("http://localhost:4000/notification-models/nm-1/queue", ({ request }) => {
        const { pagination } = JSON.parse(new URL(request.url).searchParams.get("query")!);
        expect(pagination.offset).toBe(0);
        return HttpResponse.json(notificationPage([makeNotificationRun()], 1));
      }),
      ...notificationModelHandlers()
    );
    renderWithProviders(<NotificationQueueList modelId="nm-1" />);
    expect(await screen.findByText("Position 1")).toBeInTheDocument();
  });

  it("shows the empty state", async () => {
    server.use(...notificationModelHandlers());
    renderWithProviders(<NotificationQueueList modelId="nm-1" />);
    expect(await screen.findByText("Nothing is waiting.")).toBeInTheDocument();
  });
});
