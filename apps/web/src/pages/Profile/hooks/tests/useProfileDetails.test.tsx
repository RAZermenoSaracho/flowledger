import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { baseUser, mockBaseline } from "../../tests/profileFixtures";
import { useProfileDetails } from "../useProfileDetails";
import { hookWrapper } from "./hookWrapper";

describe("useProfileDetails", () => {
  it("derives initials and 'Not set' currency for a user without a preferred currency", async () => {
    mockBaseline();
    const { result } = renderHook(() => useProfileDetails(), { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.user).toBeDefined());
    expect(result.current.initials).toBe("JD");
    expect(result.current.currencyLabel).toBe("Not set");
    expect(result.current.memberSince).not.toBeNull();
  });

  it("labels a known fiat currency with its name", async () => {
    mockBaseline({ ...baseUser, preferredCurrency: "USD" });
    const { result } = renderHook(() => useProfileDetails(), { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.currencyLabel).toBe("USD — US Dollar"));
  });

  it("starts clean with the user's values and empty defaults while loading", async () => {
    mockBaseline();
    const { result } = renderHook(() => useProfileDetails(), { wrapper: hookWrapper });
    expect(result.current.values.name).toBe("");
    await waitFor(() => expect(result.current.values.name).toBe("Jane Doe"));
    expect(result.current.draft.isDirty).toBe(false);
  });

  it("opens the password prompt instead of saving when the email changed, and closes it on cancel", async () => {
    mockBaseline();
    const { result } = renderHook(() => useProfileDetails(), { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.user).toBeDefined());
    act(() => result.current.draft.setField("email", "new@example.com"));
    await act(() => result.current.onSave());
    expect(result.current.isPasswordPromptOpen).toBe(true);
    act(() => result.current.closePasswordPrompt());
    expect(result.current.isPasswordPromptOpen).toBe(false);
    expect(result.current.draft.isDirty).toBe(true);
  });
});
