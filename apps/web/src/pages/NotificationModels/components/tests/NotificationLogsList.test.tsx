import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeNotificationRun, notificationModelHandlers } from "../../../../tests/mocks/handlers";
import { server } from "../../../../tests/mocks/server";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { NotificationLogsList } from "../NotificationLogsList";

describe("NotificationLogsList", () => {
  it("shows status, reason, transaction link and retained text; omits cleared text", async () => {
    server.use(
      ...notificationModelHandlers({
        logs: [
          makeNotificationRun({ id: "l1", status: "completed", finishedAt: "2026-11-13T10:01:00.000Z", transactionId: "tx-9", text: "Compraste $10" }),
          makeNotificationRun({ id: "l2", status: "skipped", finishedAt: "2026-11-13T10:02:00.000Z", reason: "promotion", text: null })
        ]
      })
    );
    renderWithProviders(<NotificationLogsList modelId="nm-1" />);

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View transaction" })).toHaveAttribute("href", "/transactions/tx-9");
    expect(screen.getByText("Compraste $10")).toBeInTheDocument();
    expect(screen.getByText("promotion")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("shows the empty state", async () => {
    server.use(...notificationModelHandlers());
    renderWithProviders(<NotificationLogsList modelId="nm-1" />);
    expect(await screen.findByText("No finished runs yet.")).toBeInTheDocument();
  });
});
