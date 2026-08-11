import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import { env } from "../../../../../../config/env.js";
import { signGoogleState, verifyGoogleState } from "../googleState.js";

describe("signGoogleState / verifyGoogleState", () => {
  it("round-trips a valid state payload", () => {
    const token = signGoogleState({ nonce: "abc", redirect: "/dashboard" });
    expect(verifyGoogleState(token)).toEqual({
      nonce: "abc",
      redirect: "/dashboard"
    });
  });

  it("scopes the signed token to the google-oauth audience", () => {
    const token = signGoogleState({ nonce: "abc", redirect: "/" });
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

  it("rejects a malformed token", () => {
    expect(() => verifyGoogleState("not-a-jwt")).toThrow();
  });
});
