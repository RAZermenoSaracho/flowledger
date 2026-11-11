import { z } from "zod";
import {
  IDENTITY_VISIBILITIES,
  RESERVED_USERNAMES,
  SHARE_ACCEPTANCES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH
} from "../constants/index.js";

/**
 * A public username: trimmed and lowercased, 3-30 characters of `[a-z0-9._]`, starting and ending
 * alphanumeric, no consecutive dots, not reserved. The parsed value is always the stored form.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(/^[a-z0-9]([a-z0-9._]*[a-z0-9])?$/, "Use letters, numbers, dots and underscores; start and end with a letter or number")
  .refine((value) => !value.includes(".."), "Username cannot contain consecutive dots")
  .refine((value) => !(RESERVED_USERNAMES as readonly string[]).includes(value), "This username is reserved");

/** How a user appears to others: `@username` only, or `Name (@username)`. */
export const identityVisibilitySchema = z.enum(IDENTITY_VISIBILITIES);

/** A participant's response state on a shared expense share. */
export const shareAcceptanceSchema = z.enum(SHARE_ACCEPTANCES);

/** Query of `GET /users/username-availability`. */
export const usernameAvailabilityQuerySchema = z.object({ username: usernameSchema });

/** Body of `POST /users/blocks`. */
export const blockUserSchema = z.object({ userId: z.string().min(1) });

/** Params of `DELETE /users/blocks/:userId`. */
export const blockedUserParamsSchema = z.object({ userId: z.string().min(1) });

export type BlockUserInput = z.infer<typeof blockUserSchema>;
export type UsernameAvailabilityQuery = z.infer<typeof usernameAvailabilityQuerySchema>;
