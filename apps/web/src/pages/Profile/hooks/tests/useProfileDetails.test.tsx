import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../../../../tests/mocks/server";
import { API_URL, baseUser, mockBaseline } from "../../tests/profileFixtures";
import { useProfileDetails } from "../useProfileDetails";
import { hookWrapper } from "./hookWrapper";

describe("useProfileDetails", () => {
  it("derives initials and 'Not set' currency for a user without a preferred currency", async () => {
    mockBaseline();
    const { result } = renderHook(() => useProfileDetails(), {
      wrapper: hookWrapper
    });
    await waitFor(() => expect(result.current.user).toBeDefined());
    expect(result.current.initials).toBe("JD");
    expect(result.current.currencyLabel).toBe("Not set");
    expect(result.current.memberSince).not.toBeNull();
  });

  it("labels a known fiat currency with its name", async () => {
    mockBaseline({ ...baseUser, preferredCurrency: "USD" });
    const { result } = renderHook(() => useProfileDetails(), {
      wrapper: hookWrapper
    });
    await waitFor(() =>
      expect(result.current.currencyLabel).toBe("USD — US Dollar")
    );
  });

  it("starts clean with the user's values and empty defaults while loading", async () => {
    mockBaseline();
    const { result } = renderHook(() => useProfileDetails(), {
      wrapper: hookWrapper
    });
    expect(result.current.values.name).toBe("");
    await waitFor(() => expect(result.current.values.name).toBe("Jane Doe"));
    expect(result.current.draft.isDirty).toBe(false);
  });

  it("opens the password prompt instead of saving when the email changed, and closes it on cancel", async () => {
    mockBaseline();
    const { result } = renderHook(() => useProfileDetails(), {
      wrapper: hookWrapper
    });
    await waitFor(() => expect(result.current.user).toBeDefined());
    act(() => result.current.draft.setField("email", "new@example.com"));
    await act(() => result.current.onSave());
    expect(result.current.isPasswordPromptOpen).toBe(true);
    act(() => result.current.closePasswordPrompt());
    expect(result.current.isPasswordPromptOpen).toBe(false);
    expect(result.current.draft.isDirty).toBe(true);
  });

  it("uploads the avatar once and not again on a later save of another field", async () => {
    mockBaseline();
    let uploads = 0;
    server.use(
      http.patch(`${API_URL}/users/me`, () =>
        HttpResponse.json({ user: baseUser })
      ),
      http.post(`${API_URL}/users/me/avatar`, () => {
        uploads += 1;
        return HttpResponse.json({ user: baseUser });
      })
    );
    const { result } = renderHook(() => useProfileDetails(), {
      wrapper: hookWrapper
    });
    await waitFor(() => expect(result.current.user).toBeDefined());
    act(() =>
      result.current.draft.setField(
        "avatarFile",
        new File(["x"], "a.png", { type: "image/png" })
      )
    );
    await act(() => result.current.onSave());
    expect(uploads).toBe(1);
    act(() => result.current.draft.setField("name", "Jane Q"));
    await act(() => result.current.onSave());
    expect(uploads).toBe(1);
  });
});

it.each(["  Sunny  ", ""])(
  "saves nickname %j and clears with null",
  async (nickname) => {
    mockBaseline({ ...baseUser, nickname: "Old" });
    let body: Record<string, unknown> = {};
    server.use(
      http.patch(`${API_URL}/users/me`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          user: { ...baseUser, nickname: body.nickname }
        });
      })
    );
    const { result } = renderHook(() => useProfileDetails(), {
      wrapper: hookWrapper
    });
    await waitFor(() => expect(result.current.values.nickname).toBe("Old"));
    act(() => result.current.draft.setField("nickname", nickname));
    await act(() => result.current.onSave());
    expect(body.nickname).toBe(nickname.trim() || null);
  }
);
