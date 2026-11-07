import type { Express } from "express";
import request from "supertest";
import { refreshTokenCookieName } from "../../modules/auth/utils/refreshTokenCookie.js";

/** Cookie `name=value` pairs extracted from one response's real `Set-Cookie` headers, ready to send back as a `Cookie` header. */
export function cookieHeaderFrom(response: { headers: Record<string, unknown> }) {
  const setCookie = (response.headers["set-cookie"] ?? []) as string[];
  return setCookie.map((line) => line.split(";")[0]).join("; ");
}

/** Returns the `Set-Cookie` line for `name`, or undefined. */
export function findSetCookie(
  response: { headers: Record<string, unknown> },
  name: string
) {
  const setCookie = (response.headers["set-cookie"] ?? []) as string[];
  return setCookie.find((line) => line.startsWith(`${name}=`));
}

/** Extracts only the refresh-token cookie as a `Cookie` header value. */
export function refreshCookieFrom(response: { headers: Record<string, unknown> }) {
  return (findSetCookie(response, refreshTokenCookieName) ?? "").split(";")[0] ?? "";
}

/** Registers a user and returns the register response plus the refresh cookie; each call uses a unique email. */
export async function registerWithSession(
  app: Express,
  password = "longenoughPassword"
) {
  const email = `session-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
  const response = await request(app)
    .post("/auth/register")
    .send({ name: "Session User", email, password });
  return {
    email,
    password,
    token: response.body.token as string,
    userId: response.body.user.id as string,
    cookie: refreshCookieFrom(response)
  };
}

/** Logs `email` in (a new session) and returns the response plus its refresh cookie. */
export async function loginSession(
  app: Express,
  email: string,
  password: string,
  keepLoggedIn?: boolean
) {
  const response = await request(app)
    .post("/auth/login")
    .send({ email, password, ...(keepLoggedIn === undefined ? {} : { keepLoggedIn }) });
  return { response, cookie: refreshCookieFrom(response) };
}

/** Calls `POST /auth/refresh` with `cookie`. */
export function refreshWith(app: Express, cookie: string) {
  return request(app).post("/auth/refresh").set("Cookie", cookie);
}
