import { randomBytes } from "node:crypto";
import { env } from "../../../../../config/env.js";
import { prisma } from "../../../../../db/prisma.js";
import { HttpError } from "../../../../../utils/httpError.js";
import { signAccessToken } from "../../../utils/tokens.js";
import { issueRefreshToken } from "../../../services/create.service.js";
import type { GoogleLinkResult, GoogleProfile } from "../types/google.types.js";
import {
  googleStateCookieName,
  parseCookies
} from "../utils/googleStateCookie.js";
import { signGoogleState, verifyGoogleState } from "../utils/googleState.js";
import { exchangeGoogleCode, verifyGoogleIdentity } from "./google.client.js";

const googleOAuthProvider = "google";

/** Builds the Google consent-screen URL, embedding a signed state JWT carrying a fresh nonce, the post-login `redirect` path, the session mode, and `linkUserId` for an explicit link. */
export function buildGoogleAuthUrl(
  redirect: string,
  keepLoggedIn: boolean,
  linkUserId?: string
) {
  const nonce = randomBytes(32).toString("base64url");
  const state = signGoogleState({
    nonce,
    redirect,
    keepLoggedIn,
    ...(linkUserId ? { linkUserId } : {})
  });
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

    const emailOwner = await tx.user.findFirst({
      where: { email: { equals: profile.email, mode: "insensitive" } },
      select: { id: true }
    });

    if (emailOwner) {
      throw new HttpError(
        409,
        "An account with this email already exists. Sign in with your password, then connect Google from Profile."
      );
    }

    return tx.user.create({
      data: {
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.picture,
        authAccounts: {
          create: {
            provider: googleOAuthProvider,
            providerAccountId: profile.providerAccountId,
            email: profile.email
          }
        }
      }
    });
  });
}

async function linkGoogleIdentity(
  userId: string,
  profile: GoogleProfile
): Promise<GoogleLinkResult> {
  return prisma.$transaction(async (tx) => {
    const identity = await tx.userAuthAccount.findUnique({
      where: {
        provider_providerAccountId: {
          provider: googleOAuthProvider,
          providerAccountId: profile.providerAccountId
        }
      },
      select: { userId: true }
    });

    if (identity) {
      return identity.userId === userId ? "connected" : "conflict";
    }

    const userLink = await tx.userAuthAccount.findFirst({
      where: { userId, provider: googleOAuthProvider },
      select: { id: true }
    });

    if (userLink) {
      return "conflict";
    }

    await tx.userAuthAccount.create({
      data: {
        userId,
        provider: googleOAuthProvider,
        providerAccountId: profile.providerAccountId,
        email: profile.email
      }
    });

    return "connected";
  });
}

/** Whether the user has a Google identity linked. */
export async function hasGoogleLink(userId: string) {
  const link = await prisma.userAuthAccount.findFirst({
    where: { userId, provider: googleOAuthProvider },
    select: { id: true }
  });

  return link !== null;
}

/**
 * Verifies the OAuth state/nonce cookie pair and exchanges the auth code for a Google identity.
 *
 * In sign-in mode it enters the linked or newly created account and issues an access+refresh token pair, like a regular login. In link mode (`linkUserId` in the signed state) it links the identity to that user and issues no session, reporting problems as a `linkResult` so the caller returns to Profile.
 */
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

  if (state.linkUserId) {
    return { linkResult: await completeLink(state.linkUserId, input) };
  }

  if (input.error || !input.code) {
    throw new HttpError(401, "Google authentication was cancelled");
  }

  const googleProfile = await fetchGoogleProfile(input.code);
  const user = await findOrCreateGoogleUser(googleProfile);
  const refreshToken = await issueRefreshToken(user.id, state.keepLoggedIn);

  return { token: signAccessToken(user), refreshToken, redirect: state.redirect };
}

async function fetchGoogleProfile(code: string) {
  const googleTokens = await exchangeGoogleCode(code);
  return verifyGoogleIdentity(googleTokens.id_token, googleTokens.access_token);
}

async function completeLink(
  userId: string,
  input: { code?: string; error?: string }
): Promise<GoogleLinkResult> {
  if (input.error || !input.code) {
    return "failed";
  }

  try {
    return await linkGoogleIdentity(userId, await fetchGoogleProfile(input.code));
  } catch (error) {
    console.error("Google account link failed", error);
    return "failed";
  }
}
