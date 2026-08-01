import jwt from "jsonwebtoken";
import { env } from "../../../../../config/env.js";
import { HttpError } from "../../../../../utils/httpError.js";
import type { GoogleState } from "../types/google.types.js";

export function signGoogleState(state: GoogleState) {
  return jwt.sign(state, env.JWT_SECRET, {
    audience: "google-oauth",
    expiresIn: "10m"
  });
}

export function verifyGoogleState(stateToken: string) {
  const payload = jwt.verify(stateToken, env.JWT_SECRET, {
    audience: "google-oauth"
  }) as jwt.JwtPayload;

  if (typeof payload.nonce !== "string" || typeof payload.redirect !== "string") {
    throw new HttpError(400, "Invalid OAuth state");
  }

  return { nonce: payload.nonce, redirect: payload.redirect };
}
