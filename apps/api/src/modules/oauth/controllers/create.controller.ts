import type { OAuthDecisionInput } from "@flowledger/shared";
import type { Request, Response } from "express";
import { decideConsent } from "../services/create.service.js";

/** Records the signed-in user's consent decision; the grant always belongs to `req.user`, never to the body. */
export async function postDecision(req: Request, res: Response) {
  res.json(await decideConsent(req.user!.id, req.body as OAuthDecisionInput));
}
