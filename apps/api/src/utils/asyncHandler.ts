import type { NextFunction, Request, Response } from "express";

/** Wraps an async Express handler so a rejected promise is forwarded to `next` instead of crashing the process. */
export const asyncHandler =
  (handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
