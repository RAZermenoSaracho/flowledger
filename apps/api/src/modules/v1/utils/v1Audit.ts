import type { NextFunction, Request, Response } from "express";
import { auditLog } from "../../../utils/auditLog.js";

/**
 * Builds middleware that writes exactly one audit line when the response
 * finishes. Must run after `requireCredential` (no-op without a credential).
 * `resourceId` is `req.params.id` (read eagerly: Express resets params before `finish`), else the id of the
 * `transaction`, `account`, `category`, `group`, `sharedExpense` or `settlementRequest` in the JSON response body (captured by wrapping `res.json`). Never reads `req.body`.
 */
export function auditV1Write(op: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const paramId = req.params.id;
    let createdId: string | null = null;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      const created = body as Record<string, { id?: string } | undefined> | null;
      createdId = (
        created?.transaction ??
        created?.account ??
        created?.category ??
        created?.group ??
        created?.sharedExpense ??
        created?.settlementRequest
      )?.id ?? null;
      return json(body);
    };

    res.on("finish", () => {
      if (!req.credential) return;
      auditLog({
        userId: req.credential.userId,
        credentialKind: req.credential.kind,
        credentialId: req.credential.credentialId,
        op,
        resourceId: paramId ?? createdId,
        status: res.statusCode
      });
    });
    next();
  };
}
