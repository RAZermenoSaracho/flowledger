import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { API_URL, baseUser } from "../../tests/profileFixtures";
import { usePasswordChange } from "../usePasswordChange";
import { hookWrapper } from "./hookWrapper";

const submitEvent = { preventDefault() {} } as never;

describe("usePasswordChange", () => {
  it("sets a message and clears the fields on success", async () => {
    server.use(
      http.patch(`${API_URL}/users/me/password`, () => HttpResponse.json({ user: baseUser }))
    );
    const { result } = renderHook(() => usePasswordChange(), { wrapper: hookWrapper });
    act(() => result.current.setCurrentPassword("old"));
    await act(() => result.current.submit(submitEvent));
    await waitFor(() => expect(result.current.message).toBe("Password updated"));
    expect(result.current.currentPassword).toBe("");
  });

  it("exposes the server error on failure", async () => {
    server.use(
      http.patch(`${API_URL}/users/me/password`, () =>
        HttpResponse.json({ message: "Current password is incorrect" }, { status: 401 })
      )
    );
    const { result } = renderHook(() => usePasswordChange(), { wrapper: hookWrapper });
    await act(() => result.current.submit(submitEvent));
    expect(result.current.error).toBe("Current password is incorrect");
  });
});
