import type {
  GoogleOAuthCallbackQuery,
  GoogleOAuthStartQuery
} from "@flowledger/shared";
import type { Request, Response } from "express";
import { env } from "../../../../../config/env.js";
import { HttpError } from "../../../../../utils/httpError.js";
import { buildGoogleAuthUrl, handleGoogleCallback } from "../services/create.service.js";
import { googleStateCookie } from "../utils/googleStateCookie.js";

function redirectOAuthFailure(res: Response, message: string) {
  const url = new URL("/login", env.WEB_APP_URL);
  url.searchParams.set("oauthError", message);
  res.redirect(url.toString());
}

/** Sets a short-lived state cookie and redirects the browser to Google's OAuth consent screen. */
export async function googleOAuthStart(req: Request, res: Response) {
  const query = req.query as unknown as GoogleOAuthStartQuery;
  const { nonce, url } = buildGoogleAuthUrl(query.redirect);

  res.setHeader("Set-Cookie", googleStateCookie(nonce, 10 * 60));
  res.redirect(url);
}

/** Handles Google's OAuth redirect: completes login and forwards the caller to the web app with a token, or to the login page with an error. */
export async function googleOAuthCallback(req: Request, res: Response) {
  try {
    const query = req.query as unknown as GoogleOAuthCallbackQuery;
    const { token, redirect } = await handleGoogleCallback({
      state: query.state,
      cookieHeader: req.headers.cookie,
      code: query.code,
      error: query.error
    });

    const redirectUrl = new URL("/auth/oauth/callback", env.WEB_APP_URL);
    const fragment = new URLSearchParams({ token, redirect });
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
}
