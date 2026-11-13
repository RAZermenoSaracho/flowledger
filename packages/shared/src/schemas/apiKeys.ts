import { z } from "zod";

/** Allowed lifetimes for a personal API key or OAuth grant; `never` means no expiry. */
export const credentialLifetimeSchema = z.enum(["1d", "1m", "1y", "never"]);

/** POST /users/me/api-keys body; `allowWrite` defaults to read-only and `lifetime` to one month. `ingestOnly` keys may only post notification text and cannot also `allowWrite`. */
export const createApiKeySchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    allowWrite: z.boolean().default(false),
    ingestOnly: z.boolean().default(false),
    lifetime: credentialLifetimeSchema.default("1m")
  })
  .refine((key) => !(key.ingestOnly && key.allowWrite), {
    message: "An ingest-only key cannot allow write",
    path: ["ingestOnly"]
  });

/** One of `1d | 1m | 1y | never`. */
export type CredentialLifetime = z.infer<typeof credentialLifetimeSchema>;

/** Parsed (defaults applied) create-API-key request body. */
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
