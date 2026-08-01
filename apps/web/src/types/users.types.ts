import type { MobileSidebarSide, PlanType } from "@flowledger/shared";

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

export type PublicUser = Pick<User, "id" | "name" | "email">;
