declare module "bcryptjs" {
  /** Ambient typing for the untyped `bcryptjs` CommonJS default export. */
  const bcrypt: {
    hash(data: string, saltOrRounds: string | number): Promise<string>;
    compare(data: string, encrypted: string): Promise<boolean>;
  };

  export default bcrypt;
}
