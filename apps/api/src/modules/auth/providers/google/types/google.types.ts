/** Signed OAuth state payload round-tripped through Google: a CSRF nonce, the post-login redirect path, the session mode chosen at sign-in, and, for an explicit link from Profile, the signed-in user. */
export type GoogleState = {
  nonce: string;
  redirect: string;
  keepLoggedIn: boolean;
  linkUserId?: string;
};

/** Outcome of completing a link for the signed-in user; it never names another account. */
export type GoogleLinkResult = "connected" | "conflict";

/** Verified Google identity held in the pending-link cookie until the signed-in user completes the link. */
export type GoogleLinkPending = {
  linkUserId: string;
  providerAccountId: string;
  email: string;
};

/** Normalized Google identity fields extracted after id-token and userinfo verification. */
export type GoogleProfile = {
  providerAccountId: string;
  email: string;
  name: string;
  picture?: string;
};
