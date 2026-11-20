import jwt from "jsonwebtoken";
import { env } from "../../../../../config/env.js";
import { HttpError } from "../../../../../utils/httpError.js";
import type { GoogleLinkPending, GoogleState } from "../types/google.types.js";

/** Signs a {@link GoogleState} as a 10-minute JWT scoped to the `google-oauth` audience. */
export function signGoogleState(state: GoogleState) {
  return jwt.sign(state, env.JWT_SECRET, {
    audience: "google-oauth",
    expiresIn: "10m"
  });
}

/** Verifies and decodes a signed OAuth state JWT; throws a 400 `HttpError` if the payload shape is wrong. */
export function verifyGoogleState(stateToken: string) {
  const payload = jwt.verify(stateToken, env.JWT_SECRET, {
    audience: "google-oauth",
    algorithms: ["HS256"]
  }) as jwt.JwtPayload;

  if (typeof payload.nonce !== "string" || typeof payload.redirect !== "string") {
    throw new HttpError(400, "Invalid OAuth state");
  }

  return {
    nonce: payload.nonce,
    redirect: payload.redirect,
    keepLoggedIn: payload.keepLoggedIn !== false,
    ...(typeof payload.linkUserId === "string" ? { linkUserId: payload.linkUserId } : {})
  };
}

/** Signs a {@link GoogleLinkPending} as a 5-minute JWT scoped to the `google-link` audience. */
export function signGoogleLinkPending(payload: GoogleLinkPending) {
  return jwt.sign(payload, env.JWT_SECRET, {
    audience: "google-link",
    expiresIn: "5m"
  });
}

/** Verifies a pending-link JWT; throws a generic 400 `HttpError` on any signature, audience, expiry, or shape failure. */
export function verifyGoogleLinkPending(token: string): GoogleLinkPending {
  const failure = new HttpError(400, "Google could not be connected");
  let payload: jwt.JwtPayload;

  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      audience: "google-link",
      algorithms: ["HS256"]
    }) as jwt.JwtPayload;
  } catch {
    throw failure;
  }

  const { linkUserId, providerAccountId, email } = payload;

  if (
    typeof linkUserId !== "string" || !linkUserId ||
    typeof providerAccountId !== "string" || !providerAccountId ||
    typeof email !== "string" || !email
  ) {
    throw failure;
  }

  return { linkUserId, providerAccountId, email };
}
