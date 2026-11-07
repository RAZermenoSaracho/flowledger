/** Signed OAuth state payload round-tripped through Google: a CSRF nonce, the post-login redirect path, and the session mode chosen at sign-in. */
export type GoogleState = {
  nonce: string;
  redirect: string;
  keepLoggedIn: boolean;
};

/** Normalized Google identity fields extracted after id-token and userinfo verification. */
export type GoogleProfile = {
  providerAccountId: string;
  email: string;
  name: string;
  picture?: string;
};
