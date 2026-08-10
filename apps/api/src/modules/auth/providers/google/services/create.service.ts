import { randomBytes } from "node:crypto";
import { env } from "../../../../../config/env.js";
import { prisma } from "../../../../../db/prisma.js";
import { HttpError } from "../../../../../utils/httpError.js";
import { signAccessToken } from "../../../utils/tokens.js";
import { issueRefreshToken } from "../../../services/create.service.js";
import type { GoogleProfile } from "../types/google.types.js";
import {
  googleStateCookieName,
  parseCookies
} from "../utils/googleStateCookie.js";
import { signGoogleState, verifyGoogleState } from "../utils/googleState.js";
import { exchangeGoogleCode, verifyGoogleIdentity } from "./google.client.js";

const googleOAuthProvider = "google";

/** Builds the Google consent-screen URL, embedding a signed state JWT carrying a fresh nonce and the post-login `redirect` path. */
export function buildGoogleAuthUrl(redirect: string) {
  const nonce = randomBytes(32).toString("base64url");
  const state = signGoogleState({ nonce, redirect });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", env.GOOGLE_CALLBACK_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");

  return { nonce, url: url.toString() };
}

async function findOrCreateGoogleUser(profile: GoogleProfile) {
  return prisma.$transaction(async (tx) => {
    const existingAccount = await tx.userAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: googleOAuthProvider,
          providerAccountId: profile.providerAccountId
        }
      },
      include: { user: true }
    });

    if (existingAccount) {
      return existingAccount.user;
    }

    const existingUser = await tx.user.findFirst({
      where: { email: { equals: profile.email, mode: "insensitive" } }
    });

    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          name: profile.name,
          email: profile.email,
          avatarUrl: profile.picture
        }
      }));

    await tx.userAuthAccount.create({
      data: {
        userId: user.id,
        provider: googleOAuthProvider,
        providerAccountId: profile.providerAccountId,
        email: profile.email
      }
    });

    if (!user.avatarUrl && profile.picture) {
      return tx.user.update({
        where: { id: user.id },
        data: { avatarUrl: profile.picture }
      });
    }

    return user;
  });
}

/** Verifies the OAuth state/nonce cookie pair, exchanges the auth code for a Google identity, finds-or-creates the local user, and issues an access+refresh token pair exactly like a regular login. */
export async function handleGoogleCallback(input: {
  state: string;
  cookieHeader: string | undefined;
  code?: string;
  error?: string;
}) {
  const state = verifyGoogleState(input.state);
  const cookieNonce = parseCookies(input.cookieHeader).get(googleStateCookieName);

  if (!cookieNonce || cookieNonce !== state.nonce) {
    throw new HttpError(400, "Invalid OAuth state");
  }

  if (input.error || !input.code) {
    throw new HttpError(401, "Google authentication was cancelled");
  }

  const googleTokens = await exchangeGoogleCode(input.code);
  const googleProfile = await verifyGoogleIdentity(
    googleTokens.id_token,
    googleTokens.access_token
  );
  const user = await findOrCreateGoogleUser(googleProfile);
  const refreshToken = await issueRefreshToken(user.id);

  return { token: signAccessToken(user), refreshToken, redirect: state.redirect };
}
