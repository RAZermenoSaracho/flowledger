import { describe, expect, it } from "vitest";
import { publicizeUsers, publicUserLabel, publicUserSelect, toPublicUser, userLabel } from "../publicUser.js";

const ana = { id: "u1", username: "ana", name: "Ana Pérez", identityVisibility: "username_only" as const };

describe("toPublicUser", () => {
  it("hides the name in username_only mode", () => {
    expect(toPublicUser(ana)).toEqual({ id: "u1", username: "ana", displayName: null });
  });

  it("shows the name in username_and_name mode and falls back to null when blank", () => {
    expect(toPublicUser({ ...ana, identityVisibility: "username_and_name" }).displayName).toBe("Ana Pérez");
    expect(toPublicUser({ ...ana, identityVisibility: "username_and_name", name: " " }).displayName).toBeNull();
  });

  it("never carries email or phone even if the source object has them", () => {
    const result = toPublicUser({ ...ana, email: "a@x.com", phone: "1" } as never);
    expect(Object.keys(result).sort()).toEqual(["displayName", "id", "username"]);
  });
});

describe("publicUserSelect", () => {
  it("selects no email or auth fields", () => {
    expect(Object.keys(publicUserSelect).sort()).toEqual(["id", "identityVisibility", "name", "username"]);
  });
});

describe("publicUserLabel", () => {
  it("formats with and without a display name", () => {
    expect(publicUserLabel({ username: "ana", displayName: "Ana" })).toBe("Ana (@ana)");
    expect(publicUserLabel({ username: "ana", displayName: null })).toBe("@ana");
  });
});

describe("publicizeUsers", () => {
  it("replaces nested select-shaped users and leaves other values alone", () => {
    const date = new Date("2026-01-01T00:00:00Z");
    const result = publicizeUsers({
      owner: ana,
      participants: [{ participantName: "x", user: { ...ana, id: "u2", username: "bo", identityVisibility: "username_and_name" } }, { user: null }],
      createdAt: date,
      title: "t"
    });
    expect(result).toEqual({
      owner: { id: "u1", username: "ana", displayName: null },
      participants: [{ participantName: "Ana Pérez (@bo)", user: { id: "u2", username: "bo", displayName: "Ana Pérez" } }, { user: null }],
      createdAt: date,
      title: "t"
    });
  });

  it("sets participantName to the live label for linked app users and keeps manual names", () => {
    const result = publicizeUsers([
      { participantName: "stale snapshot", user: { ...ana, identityVisibility: "username_and_name" as const } },
      { participantName: "Manual Mike", user: null }
    ]);
    expect(result[0]!.participantName).toBe("Ana Pérez (@ana)");
    expect(result[1]!.participantName).toBe("Manual Mike");
  });
});

describe("userLabel", () => {
  it("labels from a raw select row without leaking the name in username_only mode", () => {
    expect(userLabel(ana)).toBe("@ana");
  });
});
