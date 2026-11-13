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
    expect(screen.getByText("private")).toBeInTheDocument();
    expect(screen.getByText("No runs yet")).toBeInTheDocument();
  });
});
