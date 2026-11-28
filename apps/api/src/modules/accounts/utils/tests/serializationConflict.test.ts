import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { mapSerializationConflict } from "../serializationConflict.js";

describe("mapSerializationConflict", () => {
  it("maps P2034 to a 409", () => {
    const error = new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "x" });
    expect(mapSerializationConflict(error)).toMatchObject({ statusCode: 409 });
  });

  it("returns any other error unchanged", () => {
    const other = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" });
    const plain = new Error("boom");
    expect(mapSerializationConflict(other)).toBe(other);
    expect(mapSerializationConflict(plain)).toBe(plain);
  });
});
