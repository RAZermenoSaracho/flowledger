import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

type ValidationTarget = "body" | "query" | "params";

/** Builds middleware that parses `req[target]` against `schema`, replacing it with the parsed value on success or forwarding the `ZodError` to `errorHandler` on failure. */
export function validate(schema: ZodSchema, target: ValidationTarget = "body") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      next(result.error);
      return;
    }

    (req as unknown as Record<ValidationTarget, unknown>)[target] = result.data;
    next();
  };
}
