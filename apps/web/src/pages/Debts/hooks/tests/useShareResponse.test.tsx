import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { useShareResponse } from "../useShareResponse";

const API_URL = "http://localhost:4000";

function setup() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(() => useShareResponse(), { wrapper }) };
}

describe("useShareResponse", () => {
  it("does not block when the reject fails, and exposes the error", async () => {
    let blocked = false;
    server.use(
      http.post(`${API_URL}/shared-expenses/se-1/reject`, () =>
        HttpResponse.json({ message: "nope" }, { status: 400 })
      ),
      http.post(`${API_URL}/users/blocks`, () => {
        blocked = true;
        return HttpResponse.json({});
      })
    );
    const { result } = setup();

    await result.current.respond({ kind: "rejectAndBlock", sharedExpenseId: "se-1", ownerUserId: "o" });

    await waitFor(() => expect(result.current.error).toBe("nope"));
    expect(blocked).toBe(false);
  });

  it("refetches debts and notifications after an answer", async () => {
    server.use(http.post(`${API_URL}/shared-expenses/se-1/accept`, () => HttpResponse.json({})));
    const { result, queryClient } = setup();
    queryClient.setQueryData(["debts"], { stale: true });

    await result.current.respond({ kind: "accept", sharedExpenseId: "se-1" });

    await waitFor(() => expect(queryClient.getQueryState(["debts"])?.isInvalidated).toBe(true));
  });
});
