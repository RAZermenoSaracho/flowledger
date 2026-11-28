import { Prisma } from "@prisma/client";
import { conflict } from "../../../utils/httpError.js";

/** Maps a Serializable-transaction failure (P2034) to a 409 and returns any other error unchanged, for `throw mapSerializationConflict(error)`. */
export function mapSerializationConflict(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
    return conflict("Billing dates changed at the same time. Please retry");
  }
  return error;
}
