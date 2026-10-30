import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mockBaseline } from "../../tests/profileFixtures";
import { useProfileUser } from "../useProfileUser";
import { hookWrapper } from "./hookWrapper";

describe("useProfileUser", () => {
  it("loads the profile from /users/me", async () => {
    mockBaseline();
    const { result } = renderHook(() => useProfileUser(), { wrapper: hookWrapper });
    await waitFor(() => expect(result.current.user?.name).toBe("Jane Doe"));
  });
});
