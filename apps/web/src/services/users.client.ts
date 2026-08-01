import { apiAssetUrl, apiRequest } from "./api";
import type { PublicUser, User } from "../types/api";
import type { PlanType, MobileSidebarSide } from "@flowledger/shared";

export function getProfile() {
  return apiRequest<{ user: User }>("/users/me");
}

export function updateProfile(body: {
  name?: string;
  email?: string;
  preferredCurrency?: string | null;
}) {
  return apiRequest<{ user: User }>("/users/me", { method: "PATCH", body });
}

export function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("avatar", file);
  return apiRequest<{ user: User }>("/users/me/avatar", {
    method: "POST",
    body: formData
  });
}

export function updatePassword(body: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return apiRequest<{ user: User }>("/users/me/password", {
    method: "PATCH",
    body
  });
}

export function updatePlan(planType: PlanType) {
  return apiRequest<{ user: User }>("/users/me/plan", {
    method: "PATCH",
    body: { planType }
  });
}

export function updateSidebarSide(mobileSidebarSide: MobileSidebarSide) {
  return apiRequest<{ user: User }>("/users/me/sidebar-side", {
    method: "PATCH",
    body: { mobileSidebarSide }
  });
}

export function searchUsers(query: string, limit = 8) {
  return apiRequest<{ users: PublicUser[] }>("/users/search", {
    query: { q: query, limit: String(limit) }
  });
}

export function getAvatarUrl(avatarUrl: string | null | undefined) {
  return apiAssetUrl(avatarUrl);
}
