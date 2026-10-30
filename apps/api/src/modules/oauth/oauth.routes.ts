import { oauthContextQuerySchema, oauthDecisionSchema } from "@flowledger/shared";
import { metadataHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/metadata.js";
import { createOAuthMetadata, mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { Router } from "express";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { postDecision } from "./controllers/create.controller.js";
import { deleteOAuthGrant } from "./controllers/delete.controller.js";
import { getContext, getOAuthGrants } from "./controllers/read.controller.js";
import { oauthServerProvider } from "./utils/oauthProvider.js";
import { issuerUrl, mcpResourceUrl } from "./utils/tokens.js";

const SCOPES = ["read", "write", "offline_access"];

/** Consent endpoints (`/oauth/authorize/*`); mounted behind `requireAuth`, so only a web JWT can decide. */
export const oauthConsentRouter = Router();
oauthConsentRouter.get("/context", validate(oauthContextQuerySchema, "query"), asyncHandler(getContext));
oauthConsentRouter.post("/decision", validate(oauthDecisionSchema), asyncHandler(postDecision));

/** Connected-apps endpoints (`/users/me/oauth-grants`); mounted behind `requireAuth`. */
export const oauthGrantsRouter = Router();
oauthGrantsRouter.get("/", asyncHandler(getOAuthGrants));
oauthGrantsRouter.delete("/:id", asyncHandler(deleteOAuthGrant));

/**
 * Builds the authorization-server router for the app root: our metadata (SDK defaults overridden for
 * public clients, CIMD and RFC 9207) and both protected-resource paths, then the SDK's `/authorize`,
 * `/token` and `/revoke`. Evaluated lazily so the issuer is read from the validated env at mount time.
 */
export function createOAuthServerRouter() {
  const issuer = issuerUrl();
  const base = createOAuthMetadata({
    provider: oauthServerProvider,
    issuerUrl: new URL(issuer),
    scopesSupported: SCOPES
  });
  const authServerMetadata = {
    ...base,
    issuer,
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true
  };
  const resourceMetadata = {
    resource: mcpResourceUrl(),
    authorization_servers: [issuer],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"]
  };

  const router = Router();
  router.use("/.well-known/oauth-authorization-server", metadataHandler(authServerMetadata));
  router.use("/.well-known/oauth-protected-resource/mcp", metadataHandler(resourceMetadata));
  router.use("/.well-known/oauth-protected-resource", metadataHandler(resourceMetadata));
  router.use(
    mcpAuthRouter({
      provider: oauthServerProvider,
      issuerUrl: new URL(issuer),
      resourceServerUrl: new URL(mcpResourceUrl()),
      scopesSupported: SCOPES
    })
  );
  return router;
}
