import { describe, expect, it } from "vitest";
import { formatPublicUser } from "../publicUser";

describe("formatPublicUser", () => {
  it("shows the display name with the username when shared", () => {
    expect(
      formatPublicUser({
        id: "u1",
        username: "ana",
        nickname: null,
        displayName: "Ana Ruiz"
      })
    ).toBe("Ana Ruiz (@ana)");
  });

  it("falls back to the username alone", () => {
    expect(
      formatPublicUser({
        id: "u1",
        username: "ana",
        nickname: null,
        displayName: null
      })
    ).toBe("@ana");
  });
});

describe("nickname labels", () => {
  it("includes nickname and only the visible name, always with username", () => {
    expect(
      formatPublicUser({
        id: "u1",
        username: "ana",
        nickname: "Sunny",
        displayName: "Ana"
      })
    ).toBe("Sunny · Ana (@ana)");
    expect(
      formatPublicUser({
        id: "u1",
        username: "ana",
        nickname: "Sunny",
        displayName: null
      })
    ).toBe("Sunny (@ana)");
  });
});
