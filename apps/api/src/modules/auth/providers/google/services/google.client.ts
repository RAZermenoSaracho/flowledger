import { z } from "zod";
import { env } from "../../../../../config/env.js";
import { HttpError } from "../../../../../utils/httpError.js";

const googleTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expires_in: z.number().positive(),
  scope: z.string(),
  token_type: z.string(),
  id_token: z.string().min(1)
});

const googleTokenInfoSchema = z.object({
  iss: z.string(),
  aud: z.string(),
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.union([z.literal("true"), z.literal("false"), z.boolean()]),
  name: z.string().optional(),
  picture: z.string().url().optional()
});

const googleUserInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().url().optional()
});

/** Exchanges an OAuth authorization code for Google access/id tokens. */
export async function exchangeGoogleCode(code: string) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: env.GOOGLE_CALLBACK_URL,
    grant_type: "authorization_code"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) {
    throw new HttpError(401, "Google authentication failed");
  }

  return googleTokenResponseSchema.parse(await response.json());
}

/** Verifies a Google id token's issuer/audience/email-verified claims, cross-checks it against the userinfo endpoint, and returns the normalized profile. */
export async function verifyGoogleIdentity(idToken: string, accessToken: string) {
  const tokenInfoUrl = new URL("https://oauth2.googleapis.com/tokeninfo");
  tokenInfoUrl.searchParams.set("id_token", idToken);

  const tokenInfoResponse = await fetch(tokenInfoUrl);
  if (!tokenInfoResponse.ok) {
    throw new HttpError(401, "Google identity verification failed");
  }

  const tokenInfo = googleTokenInfoSchema.parse(await tokenInfoResponse.json());
  const emailVerified =
    tokenInfo.email_verified === true || tokenInfo.email_verified === "true";

  if (
    tokenInfo.aud !== env.GOOGLE_CLIENT_ID ||
    !emailVerified ||
    !["accounts.google.com", "https://accounts.google.com"].includes(tokenInfo.iss)
  ) {
    throw new HttpError(401, "Google identity verification failed");
  }

  const userInfoResponse = await fetch(
    "https://openidconnect.googleapis.com/v1/userinfo",
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!userInfoResponse.ok) {
    throw new HttpError(401, "Google profile verification failed");
  }

  const userInfo = googleUserInfoSchema.parse(await userInfoResponse.json());

  if (
    userInfo.sub !== tokenInfo.sub ||
    userInfo.email.toLowerCase() !== tokenInfo.email.toLowerCase() ||
    !userInfo.email_verified
  ) {
    throw new HttpError(401, "Google profile verification failed");
  }

  return {
    providerAccountId: tokenInfo.sub,
    email: tokenInfo.email.toLowerCase(),
    name: userInfo.name ?? tokenInfo.name ?? tokenInfo.email,
    picture: userInfo.picture ?? tokenInfo.picture
  };
}
