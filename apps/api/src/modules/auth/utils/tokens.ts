import jwt from "jsonwebtoken";
import { env } from "../../../config/env.js";

export function signToken(user: { id: string; email: string }) {
  const options: jwt.SignOptions = {
    subject: user.id,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  };

  return jwt.sign({ email: user.email }, env.JWT_SECRET, options);
}
