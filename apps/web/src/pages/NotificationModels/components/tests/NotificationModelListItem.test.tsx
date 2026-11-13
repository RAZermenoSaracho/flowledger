import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { makeNotificationModel } from "../../../../tests/mocks/handlers";
import { renderWithProviders } from "../../../../tests/utils/renderWithProviders";
import { NotificationModelListItem } from "../NotificationModelListItem";

describe("NotificationModelListItem", () => {
  it("shows an inactive private model with no runs", () => {
    renderWithProviders(<NotificationModelListItem model={makeNotificationModel()} />);
    expect(screen.getByRole("link", { name: "Plata" })).toBeInTheDocument();
    expect(screen.getByText("Inactive")).toBeInTheDocument();
    expect(screen.queryByText(/published|public/i)).not.toBeInTheDocument();
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
  });

  it("shows the published version badge only when published", () => {
    const publication = { published: true, latestVersion: 4, publishedAt: "2026-11-02T00:00:00.000Z" };
    renderWithProviders(<NotificationModelListItem model={makeNotificationModel({ visibility: "public", publication })} />);
    expect(screen.getByText("Published · v4")).toBeInTheDocument();
  });
});
