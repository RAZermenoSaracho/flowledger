import type { PublicUser } from "../types/users.types";

/** Label for another user's public identity: nickname and visible name joined by ` · `, followed by `(@username)`, or `@username` alone. Never includes an email. */
export function formatPublicUser(user: PublicUser): string {
  const parts = [user.nickname, user.displayName].filter(Boolean);
  return parts.length ? `${parts.join(" · ")} (@${user.username})` : `@${user.username}`;
}
