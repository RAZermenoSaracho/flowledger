import {
  googleOAuthCallbackQuerySchema,
  googleOAuthStartQuerySchema,
  loginSchema,
  registerSchema,
  type GoogleOAuthCallbackQuery,
  type GoogleOAuthStartQuery
} from "@flowledger/shared";
import bcrypt from "bcryptjs";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { env } from "../../config/env.js";
import { prisma } from "../../db/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { validate } from "../../middleware/validate.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { HttpError } from "../../utils/httpError.js";
import { publicUser } from "../../utils/serialize.js";

export const authRouter = Router();
const googleStateCookieName = "flowledger_google_oauth_state";
const googleOAuthProvider = "google";

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

type GoogleState = {
  nonce: string;
  redirect: string;
};

function signToken(user: { id: string; email: string }) {
  const options: jwt.SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  };

  return jwt.sign({ email: user.email }, env.JWT_SECRET, options);
}

function signGoogleState(state: GoogleState) {
  return jwt.sign(state, env.JWT_SECRET, {
    audience: "google-oauth",
    expiresIn: "10m"
  });
}

function verifyGoogleState(stateToken: string) {
  const payload = jwt.verify(stateToken, env.JWT_SECRET, {
    audience: "google-oauth"
  }) as jwt.JwtPayload;

  if (typeof payload.nonce !== "string" || typeof payload.redirect !== "string") {
    throw new HttpError(400, "Invalid OAuth state");
  }

  return { nonce: payload.nonce, redirect: payload.redirect };
}

function parseCookies(header: string | undefined) {
  const cookies = new Map<string, string>();

  for (const part of header?.split(";") ?? []) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) continue;

    const name = part.slice(0, separatorIndex).trim();
    const value = part.slice(separatorIndex + 1).trim();
    if (name) cookies.set(name, decodeURIComponent(value));
  }

  return cookies;
}

function googleStateCookie(nonce: string, maxAgeSeconds: number) {
  const parts = [
    `${googleStateCookieName}=${encodeURIComponent(nonce)}`,
    "HttpOnly",
    "SameSite=Lax",
    "Path=/auth/google/callback",
    `Max-Age=${maxAgeSeconds}`
  ];

  if (env.NODE_ENV === "production") {
    parts.push("Secure");
  }

  return parts.join("; ");
}

function redirectOAuthFailure(res: { redirect: (url: string) => void }, message: string) {
  const url = new URL("/login", env.WEB_APP_URL);
  url.searchParams.set("oauthError", message);
  res.redirect(url.toString());
}

async function exchangeGoogleCode(code: string) {
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

async function verifyGoogleIdentity(idToken: string, accessToken: string) {
  const tokenInfoUrl = new URL("https://oauth2.googleapis.com/tokeninfo");
  tokenInfoUrl.searchParams.set("id_token", idToken);

  const tokenInfoResponse = await fetch(tokenInfoUrl);
  if (!tokenInfoResponse.ok) {
    throw new HttpError(401, "Google identity verification failed");
  }

  const tokenInfo = googleTokenInfoSchema.parse(await tokenInfoResponse.json());
  const emailVerified = tokenInfo.email_verified === true || tokenInfo.email_verified === "true";

  if (
    tokenInfo.aud !== env.GOOGLE_CLIENT_ID ||
    !emailVerified ||
    !["accounts.google.com", "https://accounts.google.com"].includes(tokenInfo.iss)
  ) {
    throw new HttpError(401, "Google identity verification failed");
  }

  const userInfoResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

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

async function findOrCreateGoogleUser(profile: {
  providerAccountId: string;
  email: string;
  name: string;
  picture?: string;
}) {
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

authRouter.post(
  "/register",
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.user.findUnique({ where: { email: req.body.email } });

    if (existing) {
      throw new HttpError(409, "Email is already registered");
    }

    const passwordHash = await bcrypt.hash(req.body.password, 12);
    const user = await prisma.user.create({
      data: {
        name: req.body.name,
        email: req.body.email,
        passwordHash
      }
    });

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  })
);

authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { email: req.body.email } });
    const isValid = user?.passwordHash
      ? await bcrypt.compare(req.body.password, user.passwordHash)
      : false;

    if (!user || !isValid) {
      throw new HttpError(401, "Invalid email or password");
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  })
);

authRouter.get(
  "/google",
  validate(googleOAuthStartQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    const query = req.query as unknown as GoogleOAuthStartQuery;
    const nonce = randomBytes(32).toString("base64url");
    const state = signGoogleState({ nonce, redirect: query.redirect });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", env.GOOGLE_CALLBACK_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("prompt", "select_account");

    res.setHeader("Set-Cookie", googleStateCookie(nonce, 10 * 60));
    res.redirect(url.toString());
  })
);

authRouter.get(
  "/google/callback",
  validate(googleOAuthCallbackQuerySchema, "query"),
  asyncHandler(async (req, res) => {
    try {
      const query = req.query as unknown as GoogleOAuthCallbackQuery;
      const state = verifyGoogleState(query.state);
      const cookieNonce = parseCookies(req.headers.cookie).get(googleStateCookieName);

      if (!cookieNonce || cookieNonce !== state.nonce) {
        throw new HttpError(400, "Invalid OAuth state");
      }

      if (query.error || !query.code) {
        throw new HttpError(401, "Google authentication was cancelled");
      }

      const googleTokens = await exchangeGoogleCode(query.code);
      const googleProfile = await verifyGoogleIdentity(
        googleTokens.id_token,
        googleTokens.access_token
      );
      const user = await findOrCreateGoogleUser(googleProfile);
      const redirectUrl = new URL("/auth/oauth/callback", env.WEB_APP_URL);
      const fragment = new URLSearchParams({
        token: signToken(user),
        redirect: state.redirect
      });

      redirectUrl.hash = fragment.toString();
      res.setHeader("Set-Cookie", googleStateCookie("", 0));
      res.redirect(redirectUrl.toString());
    } catch (caught) {
      res.setHeader("Set-Cookie", googleStateCookie("", 0));
      redirectOAuthFailure(
        res,
        caught instanceof HttpError ? caught.message : "Google authentication failed"
      );
    }
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
    res.json({ user: publicUser(user) });
  })
);
