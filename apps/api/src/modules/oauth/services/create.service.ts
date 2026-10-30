import type { OAuthDecisionInput } from "@flowledger/shared";
import { redirectUriMatches } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { prisma } from "../../../db/prisma.js";
import { badRequest } from "../../../utils/httpError.js";
import { resolveExpiresAt } from "../../apiKeys/utils/apiKeys.js";
import { getCimdClient } from "../providers/cimd/services/read.service.js";
import { verifyConsentRequest } from "../utils/consentRequest.js";
import { CODE_TTL_MS, generateCode, hashToken, issuerUrl } from "../utils/tokens.js";

/**
 * Applies the signed-in user's consent decision and returns the URL to send the browser to.
 * Client, redirect, challenge, state and requested scopes come only from the signed `req`; the
 * client document and redirect are re-validated first. Approval creates the grant (read always,
 * write only if requested and allowed) with a 60 s single-use code; denial creates nothing.
 * Both redirects carry `iss` (RFC 9207).
 */
export async function decideConsent(userId: string, input: OAuthDecisionInput) {
  const req = verifyConsentRequest(input.req);
  const client = await getCimdClient(req.cid);

  if (!client || !client.redirect_uris.some((registered) => redirectUriMatches(req.ru, registered))) {
    throw badRequest("Invalid authorization request");
  }

  const target = new URL(req.ru);
  const finish = (params: Record<string, string>) => {
    for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
    if (req.st) target.searchParams.set("state", req.st);
    target.searchParams.set("iss", issuerUrl());
    return { redirectUrl: target.href };
  };

  if (!input.approve) return finish({ error: "access_denied" });

  const now = new Date();
  const code = generateCode();
  await prisma.oAuthGrant.create({
    data: {
      userId,
      clientId: req.cid,
      clientName: client.client_name ?? new URL(req.cid).hostname,
      redirectUri: req.ru,
      scopes: req.sc.includes("write") && input.allowWrite ? ["read", "write"] : ["read"],
      codeChallenge: req.cc,
      codeHash: hashToken(code),
      codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      expiresAt: resolveExpiresAt(input.lifetime, now)
    }
  });

  return finish({ code });
}
