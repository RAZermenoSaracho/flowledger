import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";
import { auditLog } from "../../../utils/auditLog.js";
import { HttpError } from "../../../utils/httpError.js";
import type { McpAuth } from "../types/mcp.types.js";
import { fail, ok } from "./toolResult.js";

function statusOf(error: unknown) {
  if (error instanceof HttpError) return error.statusCode;
  return error instanceof ZodError ? 400 : 500;
}

/** Runs a read tool and maps any thrown error to an `isError` result. */
export async function runRead(action: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
  try {
    return ok(await action());
  } catch (error) {
    return fail(error);
  }
}

/**
 * Runs a write tool: enforces the `write` scope, emits exactly one audit line for the call
 * (success or failure; never the token or body) and maps errors to `isError` results.
 * `knownResourceId` is the id named by the caller (audited on failure); `action` returns the
 * result data plus the affected resource id and HTTP-style status for the audit line.
 */
export async function runWrite(
  auth: McpAuth,
  op: string,
  knownResourceId: string | null,
  action: () => Promise<{ data: Record<string, unknown>; resourceId: string; status: number }>
): Promise<CallToolResult> {
  const audit = (resourceId: string | null, status: number) =>
    auditLog({
      userId: auth.extra.userId,
      credentialKind: auth.extra.kind,
      credentialId: auth.clientId,
      op,
      resourceId,
      status
    });

  if (!auth.scopes.includes("write")) {
    audit(knownResourceId, 403);
    return fail(new HttpError(403, "Missing required scope: write"));
  }

  try {
    const { data, resourceId, status } = await action();
    audit(resourceId, status);
    return ok(data);
  } catch (error) {
    audit(knownResourceId, statusOf(error));
    return fail(error);
  }
}
