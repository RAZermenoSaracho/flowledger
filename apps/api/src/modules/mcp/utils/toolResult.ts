import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ParseError, QueryValidationError } from "datasieve";
import { ZodError } from "zod";
import { HttpError } from "../../../utils/httpError.js";
import { serialize } from "../../../utils/serialize.js";

/** Successful tool result: `data` (an object) as both `structuredContent` and identical JSON text, with Decimals converted. */
export function ok(data: Record<string, unknown>): CallToolResult {
  const body = serialize(data);
  return { content: [{ type: "text", text: JSON.stringify(body) }], structuredContent: body };
}

/** Maps a thrown error to an `isError` result with a short message; unexpected errors are logged and reported generically. */
export function fail(error: unknown): CallToolResult {
  let message = "Internal error";

  if (
    error instanceof HttpError ||
    error instanceof ParseError ||
    error instanceof QueryValidationError
  ) {
    message = error.message;
  } else if (error instanceof ZodError) {
    message = `Validation failed: ${JSON.stringify(error.flatten())}`;
  } else {
    console.error(error);
  }

  return { isError: true, content: [{ type: "text", text: message }] };
}
