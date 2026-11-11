import type { PublicUser } from "@flowledger/shared";

/** Prisma `select` for every user shown to another user. Pair with {@link toPublicUser}; never add email, phone or auth fields. */
export const publicUserSelect = {
  id: true,
  username: true,
  name: true,
  identityVisibility: true
} as const;

/** The columns {@link publicUserSelect} loads. */
export type PublicUserSource = {
  id: string;
  username: string;
  name: string;
  identityVisibility: "username_only" | "username_and_name";
};

/** The only way a user is serialized to another user: `displayName` is the name only in `username_and_name` mode and is never an email fallback. */
export function toPublicUser(user: PublicUserSource): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.identityVisibility === "username_and_name" && user.name.trim() ? user.name : null
  };
}

/** Text label for a public user: `Name (@username)` when a display name is present, else `@username`. */
export function publicUserLabel(user: Pick<PublicUser, "username" | "displayName">): string {
  return user.displayName ? `${user.displayName} (@${user.username})` : `@${user.username}`;
}

/** {@link publicUserLabel} of a freshly loaded {@link publicUserSelect} row, for notification text. */
export function userLabel(user: PublicUserSource): string {
  return publicUserLabel(toPublicUser(user));
}

function isPublicUserSource(value: object): value is PublicUserSource {
  return "identityVisibility" in value && "username" in value && "id" in value && "name" in value;
}

/**
 * Deep-copies `value`, replacing every object loaded through {@link publicUserSelect} with its
 * {@link toPublicUser} form, so nested relations (owner, debtor, participant user, group member) are safe to send.
 * A participant row with a linked app `user` also gets `participantName` set to that user's live label, so the
 * stored snapshot never shows. Dates and other values with `toJSON` pass through untouched.
 */
export function publicizeUsers<T>(value: T): T {
  if (Array.isArray(value)) return value.map(publicizeUsers) as T;
  if (value !== null && typeof value === "object" && typeof (value as { toJSON?: unknown }).toJSON !== "function") {
    if (isPublicUserSource(value)) return toPublicUser(value) as T;
    const copy = Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, publicizeUsers(nested)]));
    const linked = copy.user as { username?: unknown; displayName?: string | null } | null | undefined;
    if (typeof copy.participantName === "string" && linked && typeof linked.username === "string") {
      copy.participantName = publicUserLabel({ username: linked.username, displayName: linked.displayName ?? null });
    }
    return copy as T;
  }
  return value;
}
