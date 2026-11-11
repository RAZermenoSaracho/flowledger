import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { FormDraftControls, FormViewTab } from "../../types/common.types";
import { ActionMenuItem } from "../ActionMenu";
import { FormView } from "../FormView";

function draftOf(
  overrides: Partial<FormDraftControls> = {}
): FormDraftControls {
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
  it("renders no Save or Cancel while clean, and no Edit button or bottom bar", () => {
    renderView(<FormView title="Thing" draft={draftOf()} />);
    expect(
      screen.queryByRole("button", { name: "Save" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /edit/i })
    ).not.toBeInTheDocument();
    expect(document.querySelector(".fixed, .sticky")).toBeNull();
  });

  it("shows enabled 40px icon Save and Cancel with tooltips when dirty", () => {
    renderView(<FormView title="Thing" draft={draftOf({ isDirty: true })} />);
    const save = screen.getByRole("button", { name: "Save" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(save).toBeEnabled();
    expect(cancel).toBeEnabled();
    expect(save).toHaveAttribute("title", "Save");
    expect(cancel).toHaveAttribute("title", "Cancel");
    expect(save.className).toContain("h-10 w-10");
    expect(cancel.className).toContain("focus-visible:ring-2");
  });

  it("keeps Save visible but disabled while clean in create mode, without Cancel", () => {
    renderView(<FormView title="New" isNew draft={draftOf()} />);
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    expect(save).toHaveAccessibleDescription("No changes to save");
    expect(
      screen.queryByRole("button", { name: "Cancel" })
    ).not.toBeInTheDocument();
  });

  it("shows a busy, disabled Save while saving and a reason when invalid", () => {
    const { unmount } = renderView(
      <FormView title="T" draft={draftOf({ isDirty: true, isSaving: true })} />
    );
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toHaveAttribute("aria-busy", "true");
    expect(save).toBeDisabled();
    unmount();
    renderView(
      <FormView
        title="T"
        draft={draftOf({ isDirty: true, fieldErrors: { a: "bad" } })}
      />
    );
    const invalid = screen.getByRole("button", { name: "Save" });
    expect(invalid).toBeDisabled();
    expect(invalid).toHaveAccessibleDescription(/Fix the highlighted fields/);
  });

  it("shows saveError inline", () => {
    renderView(
      <FormView
        title="T"
        draft={draftOf({ isDirty: true, saveError: "Nope" })}
      />
    );
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
    expect(fireEvent.keyDown(document, { key: "s", metaKey: true })).toBe(
      false
    );
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

  it("Cancel discards immediately without a confirmation", async () => {
    const draft = draftOf({ isDirty: true });
    renderView(<FormView title="T" draft={draft} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(draft.cancel).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders a descriptive back link that navigates straight away when clean", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/a"]}>
        <Routes>
          <Route
            path="/a"
            element={
              <FormView
                title="T"
                draft={draftOf()}
                backLink={{ to: "/b", label: "Back to things" }}
              />
            }
          />
          <Route path="/b" element={<p>list page</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole("link", { name: "Back to things" }));
    expect(screen.getByText("list page")).toBeInTheDocument();
  });

  it("guards the back link while dirty and navigates only after confirming", async () => {
    const draft = draftOf({ isDirty: true });
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/a"]}>
        <Routes>
          <Route
            path="/a"
            element={
              <FormView
                title="T"
                draft={draft}
                backLink={{ to: "/b", label: "Back to things" }}
              />
            }
          />
          <Route path="/b" element={<p>list page</p>} />
        </Routes>
      </MemoryRouter>
    );
    await user.click(screen.getByRole("link", { name: "Back to things" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByText("list page")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Back to things" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    expect(draft.cancel).toHaveBeenCalledOnce();
    expect(screen.getByText("list page")).toBeInTheDocument();
  });

  it("renders the Record actions menu only when actions are provided", async () => {
    const user = userEvent.setup();
    const { unmount } = renderView(
      <FormView title="T" draft={draftOf()} actions={false} />
    );
    expect(
      screen.queryByRole("button", { name: "Record actions" })
    ).not.toBeInTheDocument();
    unmount();
    renderView(
      <FormView
        title="T"
        draft={draftOf()}
        actions={<ActionMenuItem>Archive</ActionMenuItem>}
      />
    );
    await user.click(screen.getByRole("button", { name: "Record actions" }));
    expect(
      screen.getByRole("menuitem", { name: "Archive" })
    ).toBeInTheDocument();
  });

  it("renders children sections without touching the draft", () => {
    const draft = draftOf();
    renderView(
      <FormView title="T" draft={draft}>
        <p>read-only section</p>
      </FormView>
    );
    expect(screen.getByText("read-only section")).toBeInTheDocument();
    expect(draft.save).not.toHaveBeenCalled();
    expect(draft.cancel).not.toHaveBeenCalled();
  });

  describe("tabs", () => {
    const tabs: FormViewTab[] = [
      {
        id: "one",
        label: "One",
        badge: 3,
        content: <input aria-label="draft field" />
      },
      { id: "two", label: "Two", content: <p>second</p> }
    ];

    it("exposes tablist semantics, a badge and only the active panel", () => {
      renderView(
        <FormView title="T" draft={draftOf()} tabs={tabs} />,
        "/?tab=two"
      );
      expect(screen.getByRole("tablist")).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Two/ })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      expect(screen.getByRole("tab", { name: /One/ })).toHaveTextContent("3");
      expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Two");
      expect(screen.queryByLabelText("draft field")).not.toBeInTheDocument();
    });

    it("falls back to the first tab, moves with arrow keys, and never prompts", async () => {
      const user = userEvent.setup();
      renderView(
        <FormView title="T" draft={draftOf({ isDirty: true })} tabs={tabs} />,
        "/?tab=bogus"
      );
      expect(screen.getByRole("tab", { name: /One/ })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      screen.getByRole("tab", { name: /One/ }).focus();
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("tab", { name: /Two/ })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      expect(screen.getByRole("tab", { name: /Two/ })).toHaveFocus();
      await user.keyboard("{Home}");
      expect(screen.getByRole("tab", { name: /One/ })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
