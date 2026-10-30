import type { NextFunction, Request, Response } from "express";
import { prisma } from "../db/prisma.js";
import { hashApiKey } from "../modules/apiKeys/utils/apiKeys.js";
import type { CredentialScope, VerifiedCredential } from "../types/credential.types.js";
import { HttpError } from "../utils/httpError.js";

const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Resolves a bearer token to its owner and scopes. Only `fl_` API keys are
 * supported; anything else (including a web JWT) throws a 401 `HttpError`.
 * Revoked, expired, unknown keys and keys whose user is gone are rejected.
 * Updates `lastUsedAt` at most every 5 minutes, without awaiting the write.
 */
export async function verifyCredential(token: string): Promise<VerifiedCredential> {
  if (token.startsWith("fl_")) {
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

/** Express middleware: verifies the Bearer credential and sets `req.user` and `req.credential`. */
export async function requireCredential(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;

  if (!token) {
    next(new HttpError(401, "Authentication required"));
    return;
  }

  try {
    const credential = await verifyCredential(token);
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
