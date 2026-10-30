import { oauthConsentRequestSchema, type OAuthConsentRequest } from "@flowledger/shared";
import jwt from "jsonwebtoken";
import { env } from "../../../config/env.js";
import { badRequest } from "../../../utils/httpError.js";

const AUDIENCE = "oauth-consent";

/** Signs the validated `/authorize` parameters as a 10-minute JWT with audience `oauth-consent`. */
export function signConsentRequest(claims: OAuthConsentRequest) {
  return jwt.sign(claims, env.JWT_SECRET, { audience: AUDIENCE, expiresIn: "10m" });
}

/** Verifies signature, audience, expiry and claim shape; any failure is a 400 `HttpError`. */
export function verifyConsentRequest(token: string): OAuthConsentRequest {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, { audience: AUDIENCE });
    const parsed = oauthConsentRequestSchema.safeParse(payload);
    if (parsed.success) return parsed.data;
  } catch {
    // falls through to the single generic error below
  }
  throw badRequest("Invalid or expired authorization request");
}
