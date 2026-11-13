import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../../tests/utils/renderWithProviders";
import { FormViewHeader } from "../FormViewHeader";

describe("FormViewHeader", () => {
  it("renders the title and subtitle in the first row without a back link", () => {
    renderWithProviders(<FormViewHeader title="Thing" subtitle="Details" />);
    const heading = screen.getByRole("heading", { name: "Thing", level: 1 });
    const header = heading.closest("header")!;
    expect(header.firstElementChild).toContainElement(heading);
    expect(header.firstElementChild).toContainElement(
      screen.getByText("Details")
    );
    expect(header.children).toHaveLength(1);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders an accessible icon-only back link with the title below the first row", () => {
    renderWithProviders(
      <FormViewHeader
        title="Thing"
        subtitle="Details"
        backLink={{ to: "/things", label: "Back to things" }}
      />
    );
    const link = screen.getByRole("link", { name: "Back to things" });
    expect(link).toHaveAttribute("href", "/things");
    expect(link).toHaveAttribute("title", "Back to things");
    expect(link).toHaveTextContent("");
    const header = link.closest("header")!;
    expect(header.firstElementChild).toContainElement(link);
    expect(header.children[1]).toContainElement(
      screen.getByRole("heading", { name: "Thing" })
    );
    expect(header.children[1]).toContainElement(screen.getByText("Details"));
  });

  it("forwards back-link clicks to onBackClick", async () => {
    const onBackClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) =>
      event.preventDefault()
    );
    renderWithProviders(
      <FormViewHeader
        title="Thing"
        backLink={{ to: "/things", label: "Back" }}
        onBackClick={onBackClick}
      />
    );
    await userEvent.click(screen.getByRole("link", { name: "Back" }));
    expect(onBackClick).toHaveBeenCalledOnce();
    expect(onBackClick.mock.calls[0]![0].defaultPrevented).toBe(true);
  });

  it("renders the actions slot in the first row", () => {
    renderWithProviders(
      <FormViewHeader title="Thing" actions={<button>Custom action</button>} />
    );
    const action = screen.getByRole("button", { name: "Custom action" });
    expect(action.parentElement).toHaveClass(
      "flex",
      "shrink-0",
      "items-center",
      "gap-2"
    );
    expect(action.closest("header")!.firstElementChild).toContainElement(
      action
    );
  });
});
