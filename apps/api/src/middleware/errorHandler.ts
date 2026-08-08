import type { NextFunction, Request, Response } from "express";
import { ParseError, QueryValidationError } from "datasieve";
import { ZodError } from "zod";
import { HttpError } from "../utils/httpError.js";

/** Express error-handling middleware: maps `ZodError`, datasieve parse/validation errors, and `HttpError` to their respective JSON responses, and logs anything else as a 500. */
export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (error instanceof ZodError) {
    res.status(400).json({
      message: "Validation failed",
      issues: error.flatten()
    });
    return;
  }

  if (error instanceof ParseError || error instanceof QueryValidationError) {
    res.status(400).json({
      message: error.message,
      issues: error.issues
    });
    return;
  }

  if (error instanceof HttpError) {
    res.status(error.statusCode).json({
      message: error.message,
      ...(error.details && typeof error.details === "object"
        ? error.details
        : {})
    });
    return;
  }

  console.error(error);
  res.status(500).json({ message: "Internal server error" });
}
