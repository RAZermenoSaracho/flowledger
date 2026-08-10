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

/** User fields safe to expose to other users (e.g. group members, debt counterparties). */
export type PublicUser = Pick<User, "id" | "name" | "email">;
