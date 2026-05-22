import { z } from "zod";
import { PLAN_TYPES } from "../constants/index.js";

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128)
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(128)
});

export const updateUserProfileSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255),
  avatarUrl: z
    .preprocess((value) => (value === "" ? null : value), z.string().trim().url().max(2048).nullable())
    .optional()
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

export const userSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  limit: z.coerce.number().int().positive().max(25).default(10)
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type UpdateUserPasswordInput = z.infer<typeof updateUserPasswordSchema>;
export type UpdateUserPlanInput = z.infer<typeof updateUserPlanSchema>;
export type UserSearchQuery = z.infer<typeof userSearchQuerySchema>;
