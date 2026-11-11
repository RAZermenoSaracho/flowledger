import { describe, expect, it } from "vitest";
import { formatPublicUser } from "../publicUser";

describe("formatPublicUser", () => {
  it("shows the display name with the username when shared", () => {
    expect(
      formatPublicUser({ id: "u1", username: "ana", displayName: "Ana Ruiz" })
    ).toBe("Ana Ruiz (@ana)");
  });

  it("falls back to the username alone", () => {
    expect(
      formatPublicUser({ id: "u1", username: "ana", displayName: null })
    ).toBe("@ana");
  });
});
