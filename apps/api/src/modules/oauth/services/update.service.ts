import {
  InvalidGrantError,
  InvalidScopeError,
  InvalidTargetError
} from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { prisma } from "../../../db/prisma.js";
import {
  REFRESH_GRACE_MS,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  mcpResourceUrl,
  resolveAccessExpiry
} from "../utils/tokens.js";
import { revokeGrantById } from "./delete.service.js";

const notExpired = (now: Date) => ({ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] });

function assertResource(resource: URL | undefined, required: boolean) {
  if (resource ? resource.href !== new URL(mcpResourceUrl()).href : required) {
    throw new InvalidTargetError("Invalid resource");
  }
}

/** Builds the token response and the matching hashed column values for a fresh pair. */
function newPair(now: Date, grantExpiresAt: Date | null, scopes: string[]) {
  const accessToken = generateAccessToken();
  const refreshToken = generateRefreshToken();
  const accessExpiresAt = resolveAccessExpiry(now, grantExpiresAt);

  const response: OAuthTokens = {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor((accessExpiresAt.getTime() - now.getTime()) / 1000),
    refresh_token: refreshToken,
    scope: scopes.join(" ")
  };
  const columns = {
    accessTokenHash: hashToken(accessToken),
    accessExpiresAt,
    refreshTokenHash: hashToken(refreshToken),
    rotatedAt: now
  };
  return { response, columns };
}

/**
 * Exchanges an authorization code for the first token pair. The code is claimed atomically
 * (`updateMany` on unused/unexpired/unrevoked), so concurrent presentations yield exactly one
 * success; a loser whose code is already used revokes the grant (replay). PKCE is verified by the SDK
 * before this runs. `resource` and `redirectUri` must match the authorization request.
 */
export async function exchangeAuthorizationCode(
  clientId: string,
  code: string,
  redirectUri: string | undefined,
  resource: URL | undefined
): Promise<OAuthTokens> {
  assertResource(resource, true);
  const codeHash = hashToken(code);
  const grant = await prisma.oAuthGrant.findUnique({ where: { codeHash } });

  if (!grant || grant.clientId !== clientId || redirectUri !== grant.redirectUri) {
    throw new InvalidGrantError("Invalid authorization code");
  }

  const now = new Date();
  const { response, columns } = newPair(now, grant.expiresAt, grant.scopes);
  const { count } = await prisma.oAuthGrant.updateMany({
    where: {
      codeHash,
      clientId,
      codeUsedAt: null,
      codeExpiresAt: { gt: now },
      revokedAt: null,
      ...notExpired(now)
    },
    data: { codeUsedAt: now, ...columns, rotatedAt: null }
  });

  if (count === 0) {
    const current = await prisma.oAuthGrant.findUnique({ where: { codeHash } });
    if (current?.codeUsedAt) await revokeGrantById(current.id);
    throw new InvalidGrantError("Invalid authorization code");
  }
  return response;
}

/**
 * Rotates a refresh token. The presented token is accepted once (atomic `updateMany` on the current hash).
 * Presenting the immediately previous token within 30 s of its rotation is a retry or parallel refresh:
 * a fresh pair replaces the chain (grant expiry untouched). Beyond 30 s it is reuse and revokes the grant.
 * Tokens matching no grant, another client's grant, or an expired/revoked grant are `invalid_grant`;
 * requested scopes must be a subset of the grant's.
 */
export async function exchangeRefreshToken(
  clientId: string,
  refreshToken: string,
  scopes: string[] | undefined,
  resource: URL | undefined
): Promise<OAuthTokens> {
  assertResource(resource, false);
  const hash = hashToken(refreshToken);
  const known = await prisma.oAuthGrant.findFirst({
    where: { OR: [{ refreshTokenHash: hash }, { prevRefreshTokenHash: hash }] }
  });

  if (!known || known.clientId !== clientId) throw new InvalidGrantError("Invalid refresh token");
  if (scopes && !scopes.every((s) => s === "offline_access" || known.scopes.includes(s))) {
    throw new InvalidScopeError("Requested scope exceeds the grant");
  }

  const now = new Date();
  const fresh = newPair(now, known.expiresAt, known.scopes);

  const rotated = await prisma.oAuthGrant.updateMany({
    where: { id: known.id, refreshTokenHash: hash, revokedAt: null, ...notExpired(now) },
    data: { prevRefreshTokenHash: hash, ...fresh.columns }
  });
  if (rotated.count === 1) return fresh.response;

  const prev = await prisma.oAuthGrant.findFirst({ where: { id: known.id, prevRefreshTokenHash: hash } });
  if (!prev || prev.revokedAt) throw new InvalidGrantError("Invalid refresh token");

  const withinGrace = !!prev.rotatedAt && prev.rotatedAt.getTime() > now.getTime() - REFRESH_GRACE_MS;
  if (withinGrace) {
    const graced = await prisma.oAuthGrant.updateMany({
      where: {
        id: prev.id,
        prevRefreshTokenHash: hash,
        refreshTokenHash: prev.refreshTokenHash,
        rotatedAt: { gt: new Date(now.getTime() - REFRESH_GRACE_MS) },
        revokedAt: null,
        ...notExpired(now)
      },
      data: { prevRefreshTokenHash: prev.refreshTokenHash, ...fresh.columns }
    });
    if (graced.count === 1) return fresh.response;
  } else {
    await revokeGrantById(prev.id);
  }
  throw new InvalidGrantError("Invalid refresh token");
}
