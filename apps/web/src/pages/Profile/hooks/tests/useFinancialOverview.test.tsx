import { renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { API_URL } from "../../tests/profileFixtures";
import { useFinancialOverview } from "../useFinancialOverview";
import { hookWrapper } from "./hookWrapper";

describe("useFinancialOverview", () => {
  it("returns the overview on success", async () => {
    server.use(
      http.get(`${API_URL}/reports/financial-overview`, () => HttpResponse.json({ currency: "USD" }))
    );
    const { result } = renderHook(() => useFinancialOverview(), { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.data).toEqual({ currency: "USD" }));
  });

  it("exposes an error when the request fails", async () => {
    server.use(
      http.get(`${API_URL}/reports/financial-overview`, () => HttpResponse.json({ message: "no" }, { status: 500 }))
    );
    const { result } = renderHook(() => useFinancialOverview(), { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
