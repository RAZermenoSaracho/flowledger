import type { PublicUser } from "../types/users.types";

/** Label for another user's public identity: `Name (@username)` when they share a name, else `@username`. Never includes an email. */
export function formatPublicUser(user: PublicUser): string {
  return user.displayName
    ? `${user.displayName} (@${user.username})`
    : `@${user.username}`;
}
