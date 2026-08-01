export type GoogleState = {
  nonce: string;
  redirect: string;
};

export type GoogleProfile = {
  providerAccountId: string;
  email: string;
  name: string;
  picture?: string;
};
