import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { getConsentContext, listOAuthGrants } from "../services/read.service.js";
import { museClientDocument } from "../utils/hostedClients.js";

/** Returns what the consent page shows for a signed authorization request. */
export async function getContext(req: Request, res: Response) {
  res.json(await getConsentContext(req.user!.email, req.query.req as string));
}

/** Lists the caller's connected apps. */
export async function getOAuthGrants(req: Request, res: Response) {
  res.json({ grants: serialize(await listOAuthGrants(req.user!.id)) });
}

/** Serves the public Client ID Metadata Document FlowLedger hosts for Meta AI Muse. */
export function getMuseClientDocument(_req: Request, res: Response) {
  res.json(museClientDocument());
}
