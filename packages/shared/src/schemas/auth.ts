import { z } from "zod";
import { MOBILE_SIDEBAR_SIDES, PLAN_TYPES } from "../constants/index.js";

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128)
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128)
});

export const googleOAuthStartQuerySchema = z.object({
  redirect: z
    .string()
    .trim()
    .max(120)
    .refine((value) => value.startsWith("/") && !value.startsWith("//"), "Redirect must be an app path")
    .default("/")
});

export const googleOAuthCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().min(1),
  error: z.string().optional(),
  error_description: z.string().optional(),
  scope: z.string().optional(),
  authuser: z.string().optional(),
  prompt: z.string().optional()
}).refine((input) => Boolean(input.code || input.error), {
  message: "OAuth callback must include a code or error"
});

export const updateUserProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  preferredCurrency: z.string().min(1).max(10).nullable().optional()
});

export const updateUserPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128)
  })
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: "New password and confirmation must match",
    path: ["confirmPassword"]
  });

export const updateUserPlanSchema = z.object({
  planType: z.enum(PLAN_TYPES)
});

export const updateUserSidebarSideSchema = z.object({
  mobileSidebarSide: z.enum(MOBILE_SIDEBAR_SIDES)
});

export const userSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().positive().max(25).default(10)
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleOAuthStartQuery = z.infer<typeof googleOAuthStartQuerySchema>;
export type GoogleOAuthCallbackQuery = z.infer<typeof googleOAuthCallbackQuerySchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type UpdateUserPasswordInput = z.infer<typeof updateUserPasswordSchema>;
export type UpdateUserPlanInput = z.infer<typeof updateUserPlanSchema>;
export type UpdateUserSidebarSideInput = z.infer<
  typeof updateUserSidebarSideSchema
>;
export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>;
