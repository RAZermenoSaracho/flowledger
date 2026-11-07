import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../../../../../../config/env.js";
import { signAccessToken } from "../../../../utils/tokens.js";
import { signGoogleState, verifyGoogleState } from "../googleState.js";

describe("signGoogleState / verifyGoogleState", () => {
  it("round-trips a valid state payload", () => {
    const token = signGoogleState({ nonce: "abc", redirect: "/dashboard", keepLoggedIn: true });
    expect(verifyGoogleState(token)).toEqual({
      nonce: "abc",
      redirect: "/dashboard",
      keepLoggedIn: true
    });
  });

  it("round-trips keepLoggedIn=false as false", () => {
    const token = signGoogleState({ nonce: "abc", redirect: "/", keepLoggedIn: false });
    expect(verifyGoogleState(token).keepLoggedIn).toBe(false);
  });

  it("reads a state signed without keepLoggedIn as true", () => {
    const token = jwt.sign({ nonce: "abc", redirect: "/" }, env.JWT_SECRET, {
      audience: "google-oauth",
      expiresIn: "10m"
    });
    expect(verifyGoogleState(token).keepLoggedIn).toBe(true);
  });

  it("scopes the signed token to the google-oauth audience", () => {
    const token = signGoogleState({ nonce: "abc", redirect: "/", keepLoggedIn: true });
    const payload = jwt.verify(token, env.JWT_SECRET, {
      audience: "google-oauth"
    });
    expect(payload).toMatchObject({ nonce: "abc", redirect: "/" });
  });

  it("rejects a token signed for a different audience", () => {
    const token = jwt.sign(
      { nonce: "abc", redirect: "/" },
      env.JWT_SECRET,
      { audience: "something-else", expiresIn: "10m" }
    );

    expect(() => verifyGoogleState(token)).toThrow();
  });

  it("rejects a token whose payload is missing nonce/redirect", () => {
    const token = jwt.sign({}, env.JWT_SECRET, {
      audience: "google-oauth",
      expiresIn: "10m"
    });

    expect(() => verifyGoogleState(token)).toThrow("Invalid OAuth state");
  });

  it("round-trips the signed link user and omits it otherwise", () => {
    const linked = signGoogleState({
      nonce: "abc",
      redirect: "/profile",
      keepLoggedIn: true,
      linkUserId: "user-1"
    });
    const signIn = signGoogleState({ nonce: "abc", redirect: "/", keepLoggedIn: true });

    expect(verifyGoogleState(linked).linkUserId).toBe("user-1");
    expect(verifyGoogleState(signIn)).not.toHaveProperty("linkUserId");
  });

  it("rejects a wrong algorithm and an access token", () => {
    const wrongAlgorithm = jwt.sign({ nonce: "n", redirect: "/" }, env.JWT_SECRET, {
      audience: "google-oauth",
      algorithm: "HS512"
    });
    const accessToken = signAccessToken({ id: "user-1", email: "user1@example.com" });

    expect(() => verifyGoogleState(wrongAlgorithm)).toThrow();
    expect(() => verifyGoogleState(accessToken)).toThrow();
  });

  it("rejects a malformed token", () => {
    expect(() => verifyGoogleState("not-a-jwt")).toThrow();
  });
});
