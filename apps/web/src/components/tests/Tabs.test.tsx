import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "../Tabs";

const tabs = [
  { id: "a", label: "Alpha", content: <p>alpha body</p> },
  { id: "b", label: "Beta", content: <p>beta body</p> },
  { id: "c", label: "Gamma", content: <p>gamma body</p> }
];

function Harness({ idPrefix }: { idPrefix?: string }) {
  const [id, setId] = useState("a");
  return <Tabs tabs={tabs} activeId={id} onSelect={setId} idPrefix={idPrefix} />;
}

describe("Tabs", () => {
  it("shows the active panel and reports selection", async () => {
    const onSelect = vi.fn();
    render(<Tabs tabs={tabs} activeId="a" onSelect={onSelect} />);
    expect(screen.getByText("alpha body")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-selected", "true");
    await userEvent.setup().click(screen.getByRole("tab", { name: "Beta" }));
    expect(onSelect).toHaveBeenCalledWith("b");
  });

  it("navigates with arrow, Home and End keys and wraps", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    screen.getByRole("tab", { name: "Alpha" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveFocus();
    expect(screen.getByText("beta body")).toBeInTheDocument();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveFocus();
    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Gamma" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveFocus();
  });

  it("uses a roving tabIndex", () => {
    render(<Tabs tabs={tabs} activeId="b" onSelect={() => {}} />);
    expect(screen.getByRole("tab", { name: "Beta" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("tabindex", "-1");
  });

  it("keeps default ids and applies idPrefix", () => {
    const { unmount } = render(<Harness />);
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("id", "tab-a");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "panel-a");
    unmount();
    render(<Harness idPrefix="x-" />);
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("id", "x-tab-a");
    expect(screen.getByRole("tab", { name: "Alpha" })).toHaveAttribute("aria-controls", "x-panel-a");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "x-tab-a");
  });
});
