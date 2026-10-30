import { InvalidTargetError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { env } from "../../../config/env.js";
import { credentialTokenVerifier } from "../../mcp/utils/tokenVerifier.js";
import { getCimdClient } from "../providers/cimd/services/read.service.js";
import { getCodeChallenge } from "../services/read.service.js";
import { revokeToken } from "../services/delete.service.js";
import { exchangeAuthorizationCode, exchangeRefreshToken } from "../services/update.service.js";
import { signConsentRequest } from "./consentRequest.js";
import { mcpResourceUrl } from "./tokens.js";

/**
 * Prisma-backed `OAuthServerProvider` for the SDK's `mcpAuthRouter`. `authorize` requires
 * `resource` to be this server's MCP URL, then hands the browser to the SPA consent page with a
 * signed request; clients come only from the CIMD store (no registration).
 */
export const oauthServerProvider: OAuthServerProvider = {
  clientsStore: { getClient: (clientId) => getCimdClient(clientId) },

  async authorize(client, params, res) {
    if (params.resource?.href !== new URL(mcpResourceUrl()).href) {
      throw new InvalidTargetError("resource must be the MCP endpoint");
    }

    const req = signConsentRequest({
      cid: client.client_id,
      ru: params.redirectUri,
      cc: params.codeChallenge,
      st: params.state,
      sc: (params.scopes ?? []).filter((s) => s === "read" || s === "write"),
      rs: params.resource.href
    });
    res.redirect(`${env.WEB_APP_URL}/oauth/authorize?req=${encodeURIComponent(req)}`);
  },

  challengeForAuthorizationCode: (client, code) => getCodeChallenge(client.client_id, code),

  exchangeAuthorizationCode: (client, code, _verifier, redirectUri, resource) =>
    exchangeAuthorizationCode(client.client_id, code, redirectUri, resource),

  exchangeRefreshToken: (client, refreshToken, scopes, resource) =>
    exchangeRefreshToken(client.client_id, refreshToken, scopes, resource),

  verifyAccessToken: (token) => credentialTokenVerifier.verifyAccessToken(token),

  revokeToken: (client, request) => revokeToken(client.client_id, request.token)
};
