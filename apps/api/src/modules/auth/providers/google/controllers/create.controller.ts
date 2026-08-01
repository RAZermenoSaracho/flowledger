import type {
  GoogleOAuthCallbackQuery,
  GoogleOAuthStartQuery
} from "@flowledger/shared";
import type { Request, Response } from "express";
import { env } from "../../../../../config/env.js";
import { HttpError } from "../../../../../utils/httpError.js";
import { buildGoogleAuthUrl, handleGoogleCallback } from "../services/create.service.js";
import {
  googleStateCookie,
  redirectOAuthFailure
} from "../utils/googleStateCookie.js";

export async function googleOAuthStart(req: Request, res: Response) {
  const query = req.query as unknown as GoogleOAuthStartQuery;
  const { nonce, url } = buildGoogleAuthUrl(query.redirect);

  res.setHeader("Set-Cookie", googleStateCookie(nonce, 10 * 60));
  res.redirect(url);
}

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
