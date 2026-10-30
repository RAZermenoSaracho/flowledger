import type { NextFunction, Request, Response } from "express";
import { auditLog } from "../../../utils/auditLog.js";

/**
 * Builds middleware that writes exactly one audit line when the response
 * finishes. Must run after `requireCredential` (no-op without a credential).
 * `resourceId` is `req.params.id` (read eagerly: Express resets params before `finish`), else the `transaction.id` of the JSON
 * response body (captured by wrapping `res.json`). Never reads `req.body`.
 */
export function auditV1Write(op: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const paramId = req.params.id;
    let createdId: string | null = null;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      createdId = (body as { transaction?: { id?: string } } | null)?.transaction?.id ?? null;
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
