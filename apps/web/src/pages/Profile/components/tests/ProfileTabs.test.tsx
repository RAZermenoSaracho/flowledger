import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ProfileTabId } from "../../types/profile.types";
import { ProfileTabs } from "../ProfileTabs";

function Stateful({ onChange }: { onChange: (id: ProfileTabId) => void }) {
  const [active, setActive] = useState<ProfileTabId>("general");
  return (
    <ProfileTabs
      active={active}
      onChange={(id) => {
        onChange(id);
        setActive(id);
      }}
    />
  );
}

describe("ProfileTabs", () => {
  it("renders four tabs with roving tabindex on the selected one", () => {
    render(<ProfileTabs active="preferences" onChange={vi.fn()} />);
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.getByRole("tab", { name: "Preferences" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Preferences" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("tabindex", "-1");
  });

  it("calls onChange on click", async () => {
    const onChange = vi.fn();
    render(<ProfileTabs active="general" onChange={onChange} />);
    await userEvent.click(screen.getByRole("tab", { name: "Subscription" }));
    expect(onChange).toHaveBeenCalledWith("subscription");
  });

  it("moves with Arrow keys (wrapping), Home and End, and focuses the new tab", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Stateful onChange={onChange} />);
    screen.getByRole("tab", { name: "General" }).focus();

    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith("preferences");
    expect(screen.getByRole("tab", { name: "Preferences" })).toHaveFocus();

    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("general");
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith("subscription");
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith("general");
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith("subscription");
  });
});
