import type { VerifiedCredential } from "./credential.types.js";

declare global {
  namespace Express {
    interface Request {
      rawBody?: Buffer;
      credential?: VerifiedCredential;
      user?: {
        id: string;
        email: string;
      };
    }
  }
}

export {};
