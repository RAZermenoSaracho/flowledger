import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { getConsentContext, listOAuthGrants } from "../services/read.service.js";

/** Returns what the consent page shows for a signed authorization request. */
export async function getContext(req: Request, res: Response) {
  res.json(await getConsentContext(req.user!.email, req.query.req as string));
}

/** Lists the caller's connected apps. */
export async function getOAuthGrants(req: Request, res: Response) {
  res.json({ grants: serialize(await listOAuthGrants(req.user!.id)) });
}
