import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { UseFormDraftOptions } from "../../types/common.types";
import { useFormDraft } from "../useFormDraft";

type Order = { title: string; qty: number; tags: { name: string }[] };
const base: Order = { title: "Tea", qty: 1, tags: [{ name: "a" }] };

function setup(overrides: Partial<UseFormDraftOptions<Order>> = {}) {
  const save = vi.fn().mockResolvedValue(undefined);
  const validate = (v: Order): Record<string, string> => (v.title.trim() ? {} : { title: "Title is required" });
  const hook = renderHook(
    (props: { initial: Order | null }) =>
      useFormDraft<Order>({ validate, save, ...overrides, initial: props.initial }),
    { initialProps: { initial: base as Order | null } }
  );
  return { ...hook, save };
}

describe("useFormDraft", () => {
  it("gives a generic consumer draft values, dirty state and cancel", () => {
    const { result } = setup();
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setField("title", "Coffee"));
    expect(result.current.values.title).toBe("Coffee");
    expect(result.current.changedKeys).toEqual(["title"]);
    act(() => result.current.cancel());
    expect(result.current.values.title).toBe("Tea");
    expect(result.current.isDirty).toBe(false);
  });

  it("is clean and empty while initial is null", () => {
    const { result } = setup();
    const { result: loading } = renderHook(() =>
      useFormDraft<Order>({ initial: null, validate: () => ({}), save: async () => {} })
    );
    expect(loading.current.values).toEqual({});
    expect(loading.current.isDirty).toBe(false);
    expect(result.current.isDirty).toBe(false);
  });

  it("turns a key clean again when its saved value is retyped, including nested copies", () => {
    const { result } = setup();
    act(() => result.current.setField("qty", 2));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.setField("qty", 1));
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.setField("tags", [{ name: "a" }]));
    expect(result.current.changedKeys).toEqual([]);
    act(() => result.current.setField("tags", [{ name: "b" }]));
    expect(result.current.changedKeys).toEqual(["tags"]);
  });

  it("applies coupled changes with update and reverts one field", () => {
    const { result } = setup();
    act(() => result.current.update((d) => ({ ...d, title: "X", qty: 5 })));
    expect(result.current.changedKeys).toEqual(["title", "qty"]);
    act(() => result.current.revertField("qty"));
    expect(result.current.changedKeys).toEqual(["title"]);
  });

  it("blocks an invalid save and shows the error only for touched fields", async () => {
    const { result, save } = setup();
    act(() => result.current.setField("title", " "));
    expect(result.current.fieldErrors).toEqual({ title: "Title is required" });
    await act(() => result.current.save());
    expect(save).not.toHaveBeenCalled();

    const untouched = setup({ validate: () => ({ qty: "bad" }) });
    expect(untouched.result.current.fieldErrors).toEqual({});
    act(() => untouched.result.current.setField("title", "Y"));
    expect(untouched.result.current.fieldErrors).toEqual({});
    await act(() => untouched.result.current.save());
    expect(untouched.result.current.fieldErrors).toEqual({ qty: "bad" });
  });

  it("saves changed keys, then stays clean showing the saved values", async () => {
    const { result, save } = setup();
    act(() => result.current.setField("title", "Coffee"));
    await act(() => result.current.save());
    expect(save).toHaveBeenCalledWith({ ...base, title: "Coffee" }, ["title"]);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.values.title).toBe("Coffee");
    expect(result.current.saveError).toBeNull();
  });

  it("keeps the draft on failure, sets saveError and maps a field-named error", async () => {
    const error = Object.assign(new Error("Taken"), { field: "title" });
    const { result, save } = setup();
    save.mockRejectedValueOnce(error);
    act(() => result.current.setField("title", "Coffee"));
    await act(() => result.current.save());
    expect(result.current.isDirty).toBe(true);
    expect(result.current.saveError).toBe("Taken");
    expect(result.current.fieldErrors).toEqual({ title: "Taken" });
    save.mockRejectedValueOnce("boom");
    act(() => result.current.setField("title", "Latte"));
    await act(() => result.current.save());
    expect(result.current.saveError).toBe("Changes could not be saved");
    expect(result.current.fieldErrors).toEqual({});
  });

  it("ignores a second save while one is running", async () => {
    let finish!: () => void;
    const { result, save } = setup();
    save.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    act(() => result.current.setField("qty", 3));
    let first!: Promise<void>;
    act(() => {
      first = result.current.save();
      void result.current.save();
    });
    expect(result.current.isSaving).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish();
      await first;
    });
    expect(result.current.isSaving).toBe(false);
  });

  it("does not call save when nothing changed", async () => {
    const { result, save } = setup();
    await act(() => result.current.save());
    expect(save).not.toHaveBeenCalled();
  });

  it("rebases onto a changed initial when clean but never when dirty", () => {
    const { result, rerender } = setup();
    rerender({ initial: { ...base, title: "Server" } });
    expect(result.current.values.title).toBe("Server");

    act(() => result.current.setField("qty", 9));
    rerender({ initial: { ...base, title: "Server2" } });
    expect(result.current.values.qty).toBe(9);
    expect(result.current.values.title).toBe("Server");
    expect(result.current.changedKeys).toEqual(["title", "qty"]);
  });

  it("adopts a fresher initial that arrived while the save ran", async () => {
    const refreshed: Order = { ...base, title: "Coffee", tags: [{ name: "a" }, { name: "server" }] };
    let rerender: (props: { initial: Order | null }) => void = () => {};
    const save = vi.fn(async () => rerender({ initial: refreshed }));
    const hook = setup({ save });
    rerender = hook.rerender;

    act(() => hook.result.current.setField("title", "Coffee"));
    await act(() => hook.result.current.save());

    expect(hook.result.current.values).toEqual(refreshed);
    expect(hook.result.current.isDirty).toBe(false);
  });

  it("registers beforeunload only while dirty", () => {
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { result } = setup();
    expect(add.mock.calls.some(([t]) => t === "beforeunload")).toBe(false);
    act(() => result.current.setField("qty", 2));
    expect(add.mock.calls.some(([t]) => t === "beforeunload")).toBe(true);
    act(() => result.current.cancel());
    expect(remove.mock.calls.some(([t]) => t === "beforeunload")).toBe(true);
    add.mockRestore();
    remove.mockRestore();
  });
});
