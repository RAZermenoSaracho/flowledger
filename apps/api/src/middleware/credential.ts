import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hashApiKey } from "../modules/apiKeys/utils/apiKeys.js";
import type { CredentialKind, CredentialScope, VerifiedCredential } from "../types/credential.types.js";
import { HttpError } from "../utils/httpError.js";

const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Resolves a bearer token to its owner and scopes. `fl_` API keys and `flo_` OAuth access tokens are
 * supported, limited to `kinds` (default both); anything else (a web JWT, a `flr_` refresh token,
 * an unknown prefix, a kind not in `kinds`) throws a 401 `HttpError`.
 * Revoked, expired, unknown credentials and ones whose user is gone are rejected; OAuth tokens
 * are re-checked against the grant's revocation and expiry on every call.
 * Updates `lastUsedAt` at most every 5 minutes, without awaiting the write.
 */
export async function verifyCredential(
  token: string,
  kinds: readonly CredentialKind[] = ["apiKey", "oauth"]
): Promise<VerifiedCredential> {
  if (token.startsWith("flo_") && kinds.includes("oauth")) {
    const now = new Date();
    const grant = await prisma.oAuthGrant.findFirst({
      where: {
        accessTokenHash: hashApiKey(token),
        revokedAt: null,
        accessExpiresAt: { gt: now },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      },
      include: { user: { select: { id: true, email: true } } }
    });

    if (!grant?.user) throw new HttpError(401, "Invalid or expired access token");

    prisma.oAuthGrant
      .updateMany({
        where: {
          id: grant.id,
          OR: [
            { lastUsedAt: null },
            { lastUsedAt: { lt: new Date(now.getTime() - LAST_USED_THROTTLE_MS) } }
          ]
        },
        data: { lastUsedAt: now }
      })
      .catch(() => {});

    return {
      userId: grant.user.id,
      email: grant.user.email,
      scopes: grant.scopes as CredentialScope[],
      kind: "oauth",
      credentialId: grant.id
    };
  }

  if (token.startsWith("fl_") && kinds.includes("apiKey")) {
    const apiKey = await prisma.apiKey.findUnique({
      where: { secretHash: hashApiKey(token) },
      include: { user: { select: { id: true, email: true } } }
    });
    const now = new Date();

    if (
      !apiKey ||
      !apiKey.user ||
      apiKey.revokedAt ||
      (apiKey.expiresAt && apiKey.expiresAt <= now)
    ) {
      throw new HttpError(401, "Invalid or expired API key");
    }

    prisma.apiKey
      .updateMany({
        where: {
          id: apiKey.id,
          OR: [
            { lastUsedAt: null },
            { lastUsedAt: { lt: new Date(now.getTime() - LAST_USED_THROTTLE_MS) } }
          ]
        },
        data: { lastUsedAt: now }
      })
      .catch(() => {});

    return {
      userId: apiKey.user.id,
      email: apiKey.user.email,
      scopes: apiKey.scopes as CredentialScope[],
      kind: "apiKey",
      credentialId: apiKey.id
    };
  }

  throw new HttpError(401, "Invalid credential");
}

/** Express middleware for API-key-only routes (`/v1`): verifies the Bearer credential and sets `req.user` and `req.credential`. */
export async function requireCredential(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    next(new HttpError(401, "Authentication required"));
    return;
  }

  try {
    const credential = await verifyCredential(token, ["apiKey"]);
    req.user = { id: credential.userId, email: credential.email };
    req.credential = credential;
    next();
  } catch (error) {
    next(error);
  }
}

/** Builds middleware returning 403 unless `req.credential` has `scope`; `write` implies `read`. */
export function requireScope(scope: CredentialScope) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const scopes = req.credential?.scopes ?? [];
    const allowed = scopes.includes(scope) || (scope === "read" && scopes.includes("write"));

    next(allowed ? undefined : new HttpError(403, `Missing required scope: ${scope}`));
  };
}
