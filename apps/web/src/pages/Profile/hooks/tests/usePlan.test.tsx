import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { API_URL, baseUser, mockBaseline } from "../../tests/profileFixtures";
import { usePlan } from "../usePlan";
import { hookWrapper } from "./hookWrapper";

describe("usePlan", () => {
  it("switches plan on changePlan", async () => {
    mockBaseline();
    let current = baseUser;
    server.use(
      http.get(`${API_URL}/users/me`, () => HttpResponse.json({ user: current })),
      http.patch(`${API_URL}/users/me/plan`, () => {
        current = { ...baseUser, planType: "flowledger_one" };
        return HttpResponse.json({ user: current });
      })
    );
    const { result } = renderHook(() => usePlan(), { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.currentPlan).toBe("free"));
    await act(() => result.current.changePlan("flowledger_one"));
    await waitFor(() => expect(result.current.currentPlan).toBe("flowledger_one"));
  });

  it("exposes planError when the update fails", async () => {
    mockBaseline();
    server.use(
      http.patch(`${API_URL}/users/me/plan`, () =>
        HttpResponse.json({ message: "Plan change unavailable" }, { status: 400 })
      )
    );
    const { result } = renderHook(() => usePlan(), { wrapper: hookWrapper });
    await act(() => result.current.changePlan("flowledger_one"));
    expect(result.current.planError).toBe("Plan change unavailable");
  });
});
