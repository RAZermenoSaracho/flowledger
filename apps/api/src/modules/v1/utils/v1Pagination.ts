import type { NextFunction, Request, Response } from "express";
import { badRequest } from "../../../utils/httpError.js";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

/**
 * `/v1`-only page-size policy for `GET /v1/transactions`; runs after `validate`.
 * Rewrites `req.query.query` so pagination is always offset-based with page
 * size defaulting to 50 and clamped to 100. Throws 400 for non-JSON/non-object
 * input, a non-offset `kind`, or a `pageSize` below 1. Other keys are preserved.
 */
export function clampV1Pagination(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = req.query.query as string | undefined;
    let input: Record<string, unknown> = {};

    if (raw) {
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw);
      } catch {
        throw badRequest("Invalid transactions query: not valid JSON");
      }
      if (typeof decoded !== "object" || decoded === null || Array.isArray(decoded)) {
        throw badRequest("Invalid transactions query: must be a JSON object");
      }
      input = decoded as Record<string, unknown>;
    }

    const { kind = "offset", page = 1, pageSize = DEFAULT_PAGE_SIZE } = (input.pagination ??
      {}) as Record<string, unknown>;

    if (kind !== "offset") {
      throw badRequest("Invalid transactions query: only offset pagination is supported");
    }
    if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1) {
      throw badRequest("Invalid transactions query: pageSize must be an integer >= 1");
    }

    input.pagination = { kind, page, pageSize: Math.min(pageSize, MAX_PAGE_SIZE) };
    (req as unknown as { query: Record<string, unknown> }).query = {
      ...req.query,
      query: JSON.stringify(input)
    };
    next();
  } catch (error) {
    next(error);
  }
}
