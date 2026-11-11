import type { MobileSidebarSide, PlanType } from "@flowledger/shared";

/** Full user record shape as returned by the API. */
export type User = {
  id: string;
  name: string;
  email: string;
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
