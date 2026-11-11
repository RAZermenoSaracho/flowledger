import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { FormDraftControls, FormViewTab } from "../../types/common.types";
import { FormView } from "../FormView";

function draftOf(overrides: Partial<FormDraftControls> = {}): FormDraftControls {
  return {
    isDirty: false,
    isSaving: false,
    fieldErrors: {},
    saveError: null,
    save: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn(),
    ...overrides
  };
}

function renderView(ui: React.ReactElement, route = "/") {
  return render(<MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>);
}

describe("FormView", () => {
  it("renders Save and Discard disabled with a reason while clean, and no bottom bar or Edit button", () => {
    renderView(<FormView title="Thing" draft={draftOf()} />);
    const save = screen.getByRole("button", { name: "Save" });
    const discard = screen.getByRole("button", { name: "Discard" });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription("No changes to save");
    expect(save).toHaveAttribute("title", "No changes to save");
    expect(discard).toBeDisabled();
    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(document.querySelector(".fixed, .sticky")).toBeNull();
  });

  it("enables both when dirty, with 40px-high non-full-width buttons", () => {
    renderView(<FormView title="Thing" draft={draftOf({ isDirty: true })} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    expect(screen.getByRole("button", { name: "Discard" })).toBeEnabled();
    expect(save.className).toContain("min-h-10");
    expect(save.className).not.toContain("w-full");
  });

  it("shows a busy, disabled Save while saving and a reason when invalid", () => {
    const { unmount } = renderView(<FormView title="T" draft={draftOf({ isDirty: true, isSaving: true })} />);
    const save = screen.getByRole("button", { name: "Saving..." });
    expect(save).toHaveAttribute("aria-busy", "true");
    expect(save).toBeDisabled();
    unmount();
    renderView(<FormView title="T" draft={draftOf({ isDirty: true, fieldErrors: { a: "bad" } })} />);
    const invalid = screen.getByRole("button", { name: "Save" });
    expect(invalid).toBeDisabled();
    expect(invalid).toHaveAccessibleDescription(/Fix the highlighted fields/);
  });

  it("shows saveError inline", () => {
    renderView(<FormView title="T" draft={draftOf({ isDirty: true, saveError: "Nope" })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Nope");
  });

  it("saves on Ctrl/Cmd+S only when dirty, preventing the default", () => {
    const clean = draftOf();
    const { unmount } = renderView(<FormView title="T" draft={clean} />);
    expect(fireEvent.keyDown(document, { key: "s", ctrlKey: true })).toBe(true);
    expect(clean.save).not.toHaveBeenCalled();
    unmount();
    const dirty = draftOf({ isDirty: true });
    renderView(<FormView title="T" draft={dirty} />);
    expect(fireEvent.keyDown(document, { key: "s", metaKey: true })).toBe(false);
    expect(dirty.save).toHaveBeenCalledOnce();
  });

  it("uses onSave instead of draft.save for the button and the shortcut", async () => {
    const draft = draftOf({ isDirty: true });
    const onSave = vi.fn();
    renderView(<FormView title="T" draft={draft} onSave={onSave} />);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.keyDown(document, { key: "S", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(draft.save).not.toHaveBeenCalled();
  });

  it("confirms Discard when dirty and only discards when confirmed", async () => {
    const draft = draftOf({ isDirty: true });
    const user = userEvent.setup();
    renderView(<FormView title="T" draft={draft} />);
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(draft.cancel).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(draft.cancel).toHaveBeenCalledOnce();
  });

  it("confirms Back when dirty and goes straight back when clean", async () => {
    const onBack = vi.fn();
    const user = userEvent.setup();
    const { unmount } = renderView(<FormView title="T" draft={draftOf()} onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    unmount();
    const draft = draftOf({ isDirty: true });
    renderView(<FormView title="T" draft={draft} onBack={onBack} />);
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(draft.cancel).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it("renders children sections without touching the draft", () => {
    const draft = draftOf();
    renderView(<FormView title="T" draft={draft}><p>read-only section</p></FormView>);
    expect(screen.getByText("read-only section")).toBeInTheDocument();
    expect(draft.save).not.toHaveBeenCalled();
    expect(draft.cancel).not.toHaveBeenCalled();
  });

  describe("tabs", () => {
    const tabs: FormViewTab[] = [
      { id: "one", label: "One", badge: 3, content: <input aria-label="draft field" /> },
      { id: "two", label: "Two", content: <p>second</p> }
    ];

    it("exposes tablist semantics, a badge and only the active panel", () => {
      renderView(<FormView title="T" draft={draftOf()} tabs={tabs} />, "/?tab=two");
      expect(screen.getByRole("tablist")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Two/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /One/ })).toHaveTextContent("3");
      expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Two");
      expect(screen.queryByLabelText("draft field")).not.toBeInTheDocument();
    });

    it("falls back to the first tab, moves with arrow keys, and never prompts", async () => {
      const user = userEvent.setup();
      renderView(<FormView title="T" draft={draftOf({ isDirty: true })} tabs={tabs} />, "/?tab=bogus");
      expect(screen.getByRole("tab", { name: /One/ })).toHaveAttribute("aria-selected", "true");
      screen.getByRole("tab", { name: /One/ }).focus();
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("tab", { name: /Two/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: /Two/ })).toHaveFocus();
      await user.keyboard("{Home}");
      expect(screen.getByRole("tab", { name: /One/ })).toHaveAttribute("aria-selected", "true");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
