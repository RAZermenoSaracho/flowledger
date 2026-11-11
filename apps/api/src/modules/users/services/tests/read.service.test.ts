import { describe, expect, it } from "vitest";
import { prismaMock } from "../../../../tests/helpers/prismaMock.js";
import {
  assertNoBlockedInvitees,
  findBlockedEitherUserIds,
  getCurrentUser,
  isBlockedEither,
  isUsernameAvailable,
  listBlocks,
  searchUsers
} from "../read.service.js";

const row = (id: string, username: string, name = "Secret Name") => ({
  id,
  username,
  name,
  nickname: null,
  identityVisibility: "username_only" as const
});

describe("searchUsers", () => {
  it("lists the exact username first, then prefix matches, as public users without email or name", async () => {
    prismaMock.user.findFirst.mockResolvedValue(row("u2", "ana_1") as never);
    prismaMock.user.findMany.mockResolvedValue([row("u3", "ana_10")] as never);

    const result = await searchUsers("u1", "Ana_1", 10);

    expect(result).toEqual([
      { id: "u2", username: "ana_1", nickname: null, displayName: null },
      { id: "u3", username: "ana_10", nickname: null, displayName: null }
    ]);
    const exactWhere = prismaMock.user.findFirst.mock.calls[0]![0]!.where;
    expect(exactWhere).toMatchObject({ username: "ana_1", id: { not: "u1" } });
    const prefix = prismaMock.user.findMany.mock.calls[0]![0]!;
    expect(prefix.where).toMatchObject({
      NOT: { id: "u2" },
      OR: [{ username: { startsWith: "ana_1", mode: "insensitive" } }, { nickname: { startsWith: "Ana_1", mode: "insensitive" } }],
      blocksMade: { none: { blockedId: "u1" } },
      blocksReceived: { none: { blockerId: "u1" } }
    });
    expect(prefix.take).toBe(9);
    expect(JSON.stringify([exactWhere, prefix.where, prefix.select])).not.toMatch(/email/);
  });

  it("uses the full limit when there is no exact match and strips a leading @", async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    prismaMock.user.findMany.mockResolvedValue([]);

    await searchUsers("u1", "@bob", 10);

    expect(prismaMock.user.findMany.mock.calls[0]![0]!.take).toBe(10);
    expect(prismaMock.user.findMany.mock.calls[0]![0]!.where).toMatchObject({ OR: [{ username: { startsWith: "bob", mode: "insensitive" } }, { nickname: { startsWith: "@bob", mode: "insensitive" } }] });
  });

  it("returns nothing for an empty needle without querying", async () => {
    expect(await searchUsers("u1", " @ ", 10)).toEqual([]);
  });
});

describe("isUsernameAvailable", () => {
  it("is false for another user's username and true for free or the caller's own", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u2" } as never);
    expect(await isUsernameAvailable("u1", "taken")).toBe(false);
    prismaMock.user.findUnique.mockResolvedValueOnce({ id: "u1" } as never);
    expect(await isUsernameAvailable("u1", "mine")).toBe(true);
    prismaMock.user.findUnique.mockResolvedValueOnce(null);
    expect(await isUsernameAvailable("u1", "free")).toBe(true);
  });
});

describe("getCurrentUser", () => {
  it("returns the user by id", async () => {
    prismaMock.user.findUniqueOrThrow.mockResolvedValue({ id: "user-1", nickname: "Sunny" } as never);

    expect(await getCurrentUser("user-1")).toMatchObject({ id: "user-1", nickname: "Sunny" });
  });
});

describe("listBlocks", () => {
  it("scopes to the caller and maps each blocked user to the public shape", async () => {
    prismaMock.userBlock.findMany.mockResolvedValue([
      { id: "b1", createdAt: new Date(0), blocked: row("u2", "bo") }
    ] as never);

    const result = await listBlocks("u1");

    expect(prismaMock.userBlock.findMany.mock.calls[0]![0]!.where).toEqual({ blockerId: "u1" });
    expect(result).toEqual([{ id: "b1", createdAt: new Date(0), user: { id: "u2", username: "bo", nickname: null, displayName: null } }]);
  });
});

describe("block checks", () => {
  it("isBlockedEither looks in both directions", async () => {
    prismaMock.userBlock.count.mockResolvedValue(1);
    expect(await isBlockedEither("a", "b")).toBe(true);
    expect(prismaMock.userBlock.count.mock.calls[0]![0]!.where).toEqual({
      OR: [
        { blockerId: "a", blockedId: "b" },
        { blockerId: "b", blockedId: "a" }
      ]
    });
  });

  it("findBlockedEitherUserIds returns the other side of each block", async () => {
    prismaMock.userBlock.findMany.mockResolvedValue([
      { blockerId: "me", blockedId: "x" },
      { blockerId: "y", blockedId: "me" }
    ] as never);
    expect(await findBlockedEitherUserIds("me", ["x", "y", "z"])).toEqual(new Set(["x", "y"]));
    expect(await findBlockedEitherUserIds("me", [])).toEqual(new Set());
  });

  it("assertNoBlockedInvitees throws the generic 400 only when someone is blocked", async () => {
    prismaMock.userBlock.findMany.mockResolvedValueOnce([{ blockerId: "me", blockedId: "x" }] as never);
    await expect(assertNoBlockedInvitees("me", ["x"])).rejects.toMatchObject({
      statusCode: 400,
      message: "This user can't be invited."
    });
    prismaMock.userBlock.findMany.mockResolvedValueOnce([]);
    await expect(assertNoBlockedInvitees("me", ["z"])).resolves.toBeUndefined();
  });
});

it("returns distinct usernames sharing a nickname and filters blocks in both queries", async () => {
  prismaMock.user.findFirst.mockResolvedValue(row("u2", "sunny") as never);
  prismaMock.user.findMany.mockResolvedValue([
    { ...row("u3", "alice"), nickname: "Sunny" },
    { ...row("u4", "bob"), nickname: "Sunny" }
  ] as never);
  const users = await searchUsers("me", "Sunny", 10);
  expect(users.map((user) => user.username)).toEqual(["sunny", "alice", "bob"]);
  expect(users.slice(1).map((user) => user.nickname)).toEqual(["Sunny", "Sunny"]);
  for (const call of [prismaMock.user.findFirst.mock.calls[0], prismaMock.user.findMany.mock.calls[0]]) {
    expect(call![0]!.where).toMatchObject({
      id: { not: "me" },
      blocksMade: { none: { blockedId: "me" } },
      blocksReceived: { none: { blockerId: "me" } }
    });
  }
});
