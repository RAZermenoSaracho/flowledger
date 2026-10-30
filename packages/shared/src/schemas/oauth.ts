import { z } from "zod";
import { credentialLifetimeSchema } from "./apiKeys.js";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** True for an `https:` URL or an `http:` URL on a loopback host; the only redirect URIs a client document may register. */
function isAllowedRedirectUri(value: string) {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.protocol === "https:" || (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname));
}

/** Claims of the signed consent-request JWT that carries the validated `/authorize` parameters to the SPA. */
export const oauthConsentRequestSchema = z.object({
  cid: z.string().url(),
  ru: z.string().url(),
  cc: z.string().min(1),
  st: z.string().optional(),
  sc: z.array(z.string()),
  rs: z.string().url()
});

/** GET /oauth/authorize/context query: the signed consent request. */
export const oauthContextQuerySchema = z.object({ req: z.string().min(1) });

/** POST /oauth/authorize/decision body; `allowWrite` defaults to read-only, `lifetime` to one month. */
export const oauthDecisionSchema = z.object({
  req: z.string().min(1),
  approve: z.boolean(),
  allowWrite: z.boolean().default(false),
  lifetime: credentialLifetimeSchema.default("1m")
});

/** Client Identifier Metadata Document fields FlowLedger reads; unknown fields are ignored. */
export const cimdDocumentSchema = z.object({
  client_id: z.string().url(),
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z
    .array(z.string().refine(isAllowedRedirectUri, "Invalid redirect URI"))
    .min(1)
    .max(20),
  token_endpoint_auth_method: z.string().optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional()
});

/** Response of GET /oauth/authorize/context. */
export const oauthConsentContextSchema = z.object({
  client: z.object({ name: z.string(), redirectHost: z.string() }),
  scopes: z.object({
    requested: z.union([z.tuple([z.literal("read")]), z.tuple([z.literal("read"), z.literal("write")])])
  }),
  user: z.object({ email: z.string() })
});

/** Response of POST /oauth/authorize/decision: where to send the browser next. */
export const oauthDecisionResultSchema = z.object({ redirectUrl: z.string().url() });

/** One connected app as listed by GET /users/me/oauth-grants; never carries token material. */
export const oauthGrantSummarySchema = z.object({
  id: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  redirectHost: z.string(),
  scopes: z.array(z.string()),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  lastUsedAt: z.string().nullable()
});

/** Parsed signed consent-request claims. */
export type OAuthConsentRequest = z.infer<typeof oauthConsentRequestSchema>;
/** Parsed decision body (defaults applied). */
export type OAuthDecisionInput = z.infer<typeof oauthDecisionSchema>;
/** Parsed client metadata document. */
export type CimdDocument = z.infer<typeof cimdDocumentSchema>;
/** Consent page context. */
export type OAuthConsentContext = z.infer<typeof oauthConsentContextSchema>;
/** Decision result. */
export type OAuthDecisionResult = z.infer<typeof oauthDecisionResultSchema>;
/** Connected-app list item. */
export type OAuthGrantSummary = z.infer<typeof oauthGrantSummarySchema>;
