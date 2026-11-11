import { apiAssetUrl, apiRequest } from "./api.client";
import type { PublicUser, User } from "../types/users.types";
import type { PlanType, MobileSidebarSide, UpdateUserEmailInput } from "@flowledger/shared";

/** Fetches the current user's profile. */
export function getProfile() {
  return apiRequest<{ user: User }>("/users/me");
}

/** Updates the user's profile fields. */
export function updateProfile(body: {
  name?: string;
  email?: string;
  preferredCurrency?: string | null;
}) {
  return apiRequest<{ user: User }>("/users/me", { method: "PATCH", body });
}

/** Uploads a new avatar image. */
export function uploadAvatar(file: File) {
  const formData = new FormData();
  formData.append("avatar", file);
  return apiRequest<{ user: User }>("/users/me/avatar", {
    method: "POST",
    body: formData
  });
}

/** Changes the user's password, ending their sessions on other devices. */
export function updatePassword(body: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return apiRequest<void>("/auth/password", {
    method: "PATCH",
    body
  });
}

/** Changes the user's email after re-checking their password; resolves a fresh access token for this device while other devices are signed out. */
export function updateEmail(body: UpdateUserEmailInput) {
  return apiRequest<{ token: string; user: User }>("/auth/email", {
    method: "PATCH",
    body
  });
}

/** Changes the user's plan type. */
export function updatePlan(planType: PlanType) {
  return apiRequest<{ user: User }>("/users/me/plan", {
    method: "PATCH",
    body: { planType }
  });
}

/** Updates the user's mobile sidebar-side preference. */
export function updateSidebarSide(mobileSidebarSide: MobileSidebarSide) {
  return apiRequest<{ user: User }>("/users/me/sidebar-side", {
    method: "PATCH",
    body: { mobileSidebarSide }
  });
}

/** Searches other users by username (min 3 chars). */
export function searchUsers(query: string, limit = 8) {
  return apiRequest<{ users: PublicUser[] }>("/users/search", {
    query: { q: query, limit: String(limit) }
  });
}

/** Resolves an avatar path to a full URL. */
export function getAvatarUrl(avatarUrl: string | null | undefined) {
  return apiAssetUrl(avatarUrl);
}
