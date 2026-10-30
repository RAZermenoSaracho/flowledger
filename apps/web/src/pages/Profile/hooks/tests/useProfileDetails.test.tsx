import { renderHook, waitFor } from "@testing-library/react";
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
});
