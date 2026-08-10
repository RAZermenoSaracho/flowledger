/** Signed OAuth state payload round-tripped through Google: a CSRF nonce plus the post-login redirect path. */
export type GoogleState = {
  nonce: string;
  redirect: string;
};

/** Normalized Google identity fields extracted after id-token and userinfo verification. */
export type GoogleProfile = {
  providerAccountId: string;
  email: string;
  name: string;
  picture?: string;
};
