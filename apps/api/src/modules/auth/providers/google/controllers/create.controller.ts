import type {
  GoogleOAuthCallbackQuery,
  GoogleOAuthStartQuery
} from "@flowledger/shared";
import type { Request, Response } from "express";
import { env } from "../../../../../config/env.js";
import { HttpError } from "../../../../../utils/httpError.js";
import {
  buildGoogleAuthUrl,
  handleGoogleCallback,
  hasGoogleLink
} from "../services/create.service.js";
import { googleStateCookie } from "../utils/googleStateCookie.js";
import { buildSessionCookies } from "../../../utils/refreshTokenCookie.js";

function redirectOAuthFailure(res: Response, message: string) {
  const url = new URL("/login", env.WEB_APP_URL);
  url.searchParams.set("oauthError", message);
  res.redirect(url.toString());
}

/** Sets a short-lived state cookie and redirects the browser to Google's OAuth consent screen. */
export async function googleOAuthStart(req: Request, res: Response) {
  const query = req.query as unknown as GoogleOAuthStartQuery;
  const { nonce, url } = buildGoogleAuthUrl(
    query.redirect,
    query.keepLoggedIn !== "false"
  );

  res.setHeader("Set-Cookie", googleStateCookie(nonce, 10 * 60));
  res.redirect(url);
}

/** Starts the link flow for the signed-in user: sets the state cookie and returns Google's URL for the web app to open. */
export async function googleLinkStart(req: Request, res: Response) {
  const { nonce, url } = buildGoogleAuthUrl("/profile", true, req.user!.id);

  res.setHeader("Set-Cookie", googleStateCookie(nonce, 10 * 60));
  res.json({ url });
}

/** Reports whether the signed-in user has Google connected. */
export async function googleLinkStatus(req: Request, res: Response) {
  res.json({ connected: await hasGoogleLink(req.user!.id) });
}

/** Handles Google's OAuth redirect: completes login and forwards the caller to the web app with a token, returns a link flow to Profile with its result and no session, or sends a failure to the login page with an error. */
export async function googleOAuthCallback(req: Request, res: Response) {
  try {
    const query = req.query as unknown as GoogleOAuthCallbackQuery;
    const result = await handleGoogleCallback({
      state: query.state,
      cookieHeader: req.headers.cookie,
      code: query.code,
      error: query.error
    });

    if (result.linkResult) {
      const profileUrl = new URL("/profile", env.WEB_APP_URL);
      profileUrl.searchParams.set("tab", "security");
      profileUrl.searchParams.set("googleLink", result.linkResult);
      res.setHeader("Set-Cookie", googleStateCookie("", 0));
      res.redirect(profileUrl.toString());
      return;
    }

    const { token, refreshToken, redirect } = result;
    const redirectUrl = new URL("/auth/oauth/callback", env.WEB_APP_URL);
    const fragment = new URLSearchParams({ token, redirect });
    redirectUrl.hash = fragment.toString();

    res.setHeader("Set-Cookie", [
      googleStateCookie("", 0),
      ...buildSessionCookies(refreshToken)
    ]);
    res.redirect(redirectUrl.toString());
  } catch (caught) {
    res.setHeader("Set-Cookie", googleStateCookie("", 0));
    redirectOAuthFailure(
      res,
      caught instanceof HttpError ? caught.message : "Google authentication failed"
    );
  }
}
