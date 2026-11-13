import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { makeNotificationModel } from "../../../../tests/mocks/handlers";
import { server } from "../../../../tests/mocks/server";
import { NEW_MODEL_CODE } from "../../utils/modelTemplate";
import { useNotificationModelForm } from "../useNotificationModelForm";

const API = "http://localhost:4000";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("useNotificationModelForm", () => {
  it("starts a new model from the template and creates it with every field", async () => {
    let body: Record<string, unknown> | undefined;
    server.use(
      http.post(`${API}/notification-models`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ model: makeNotificationModel() }, { status: 201 });
      })
    );
    const { result } = renderHook(() => useNotificationModelForm(null, true), { wrapper });
    expect(result.current.values.code).toBe(NEW_MODEL_CODE);
    expect(result.current.values.slots.map((slot) => slot.key)).toEqual(["card", "general"]);

    act(() => result.current.setField("name", "  Plata  "));
    await act(() => result.current.save());

    expect(body).toMatchObject({ name: "Plata", code: NEW_MODEL_CODE, isActive: false, visibility: "private", description: null });
  });

  it("updates only the changed fields", async () => {
    let body: unknown;
    server.use(
      http.put(`${API}/notification-models/nm-1`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ model: makeNotificationModel({ name: "Renamed" }) });
      })
    );
    const { result } = renderHook(() => useNotificationModelForm(makeNotificationModel(), false), { wrapper });
    act(() => result.current.setField("name", "Renamed"));
    await act(() => result.current.save());
    expect(body).toEqual({ name: "Renamed" });
  });

  it("keeps the draft and reports a script error with its line on code", async () => {
    server.use(
      http.put(`${API}/notification-models/nm-1`, () =>
        HttpResponse.json({ message: "Script is invalid", errors: [{ line: 3, col: 1, message: "import is not allowed" }] }, { status: 400 })
      )
    );
    const { result } = renderHook(() => useNotificationModelForm(makeNotificationModel(), false), { wrapper });
    act(() => result.current.setField("code", "import os"));
    await act(() => result.current.save());

    await waitFor(() => expect(result.current.saveError).toContain("line 3: import is not allowed"));
    expect(result.current.fieldErrors.code).toContain("line 3");
    expect(result.current.values.code).toBe("import os");
  });

  it("addresses an activation failure to the active field and lists the slots", async () => {
    server.use(
      http.put(`${API}/notification-models/nm-1`, () =>
        HttpResponse.json({ message: "Required slots are not bound: card", unboundSlots: ["card"] }, { status: 400 })
      )
    );
    const { result } = renderHook(() => useNotificationModelForm(makeNotificationModel(), false), { wrapper });
    act(() => result.current.setField("isActive", true));
    await act(() => result.current.save());

    await waitFor(() => expect(result.current.fieldErrors.isActive).toBe("Required slots are not bound: card"));
  });
});
