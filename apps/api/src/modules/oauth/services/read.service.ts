import type { OAuthConsentContext } from "@flowledger/shared";
import { prisma } from "../../../db/prisma.js";
import { badRequest } from "../../../utils/httpError.js";
import { getCimdClient } from "../providers/cimd/services/read.service.js";
import { verifyConsentRequest } from "../utils/consentRequest.js";
import { InvalidGrantError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { hashToken } from "../utils/tokens.js";
import { revokeGrantById } from "./delete.service.js";

/** Builds the consent-page context from a signed request; re-fetches the client so a stale or withdrawn document fails here. */
export async function getConsentContext(
  userEmail: string,
  reqToken: string
): Promise<OAuthConsentContext> {
  const req = verifyConsentRequest(reqToken);
  const client = await getCimdClient(req.cid);
  if (!client) throw badRequest("Unknown client");

  return {
    client: { name: client.client_name ?? new URL(req.cid).hostname, redirectHost: new URL(req.ru).host },
    scopes: { requested: req.sc.includes("write") ? ["read", "write"] : ["read"] },
    user: { email: userEmail }
  };
}

/** Lists the user's completed (code exchanged), non-revoked, non-expired grants without any token material. */
export async function listOAuthGrants(userId: string) {
  const now = new Date();
  const grants = await prisma.oAuthGrant.findMany({
    where: {
      userId,
      codeUsedAt: { not: null },
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    select: {
      id: true,
      clientId: true,
      clientName: true,
      redirectUri: true,
      scopes: true,
      createdAt: true,
      expiresAt: true,
      lastUsedAt: true
    },
    orderBy: { createdAt: "desc" }
  });

  return grants.map(({ redirectUri, ...grant }) => ({
    ...grant,
    redirectHost: new URL(redirectUri).host
  }));
}

/**
 * Returns the PKCE challenge bound to `code` for the token endpoint to check. Unknown, other-client,
 * expired or revoked codes are `invalid_grant`; a code already used revokes its grant (replay).
 */
export async function getCodeChallenge(clientId: string, code: string) {
  const grant = await prisma.oAuthGrant.findUnique({ where: { codeHash: hashToken(code) } });

  if (!grant || grant.clientId !== clientId) throw new InvalidGrantError("Invalid authorization code");
  if (grant.codeUsedAt) {
    await revokeGrantById(grant.id);
    throw new InvalidGrantError("Invalid authorization code");
  }
  if (grant.revokedAt || grant.codeExpiresAt <= new Date()) {
    throw new InvalidGrantError("Invalid authorization code");
  }
  return grant.codeChallenge;
}
