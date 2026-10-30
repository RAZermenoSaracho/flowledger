import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { verifyCredential } from "../../../middleware/credential.js";
import { HttpError } from "../../../utils/httpError.js";
import type { McpAuth } from "../types/mcp.types.js";

const EXPIRY_SENTINEL_SECONDS = 60;

/**
 * Adapts `verifyCredential` to the SDK's verifier contract. A rejected credential (401 `HttpError`)
 * becomes `InvalidTokenError`; any other error propagates so outages are not reported as 401.
 * The SDK demands a numeric `expiresAt`, but credentials are re-checked in the database on every request,
 * so a short sentinel is used instead of the real expiry.
 */
export const credentialTokenVerifier: OAuthTokenVerifier = {
  async verifyAccessToken(token): Promise<McpAuth> {
    try {
      const credential = await verifyCredential(token);
      return {
        token,
        clientId: credential.credentialId,
        scopes: credential.scopes,
        expiresAt: Math.floor(Date.now() / 1000) + EXPIRY_SENTINEL_SECONDS,
        extra: { userId: credential.userId, kind: credential.kind }
      };
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 401) {
        throw new InvalidTokenError(error.message);
      }
      throw error;
    }
  }
};
