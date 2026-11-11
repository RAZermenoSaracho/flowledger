import type { IDENTITY_VISIBILITIES, MobileSidebarSide, PlanType } from "@flowledger/shared";

/** How a user appears to others: `@username` only, or `Name (@username)`. */
export type IdentityVisibility = (typeof IDENTITY_VISIBILITIES)[number];

/** Full user record shape as returned by the API. */
export type User = {
  id: string;
  name: string;
  email: string;
  username: string;
  identityVisibility: IdentityVisibility;
  avatarUrl?: string | null;
  planType: PlanType;
  preferredCurrency?: string | null;
  mobileSidebarSide: MobileSidebarSide;
  createdAt: string;
  updatedAt: string;
};

/** Public identity of another user (group members, debt counterparties, participants); never carries email or name. */
export type PublicUser = {
  id: string;
  username: string;
  displayName: string | null;
};

/** One entry of the signed-in user's block list. */
export type BlockedUser = {
  id: string;
  createdAt: string;
  user: PublicUser;
};
