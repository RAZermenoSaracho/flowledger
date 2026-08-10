import type { Request, Response } from "express";
import { HttpError } from "../../../utils/httpError.js";
import { serialize } from "../../../utils/serialize.js";
import {
  refreshSyncfyCredential,
  resyncConnection,
  resyncProviderAccount
} from "../services/providerConnections.update.service.js";

/** Triggers a resync of all accounts under a provider connection owned by the authenticated user. */
export async function postResyncConnection(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication required");
  }

  const result = await resyncConnection(userId, req.params.id!);
  res.json({ resync: serialize(result) });
}

/** Manually triggers a Syncfy credential refresh for the authenticated user. */
export async function postRefreshSyncfyCredential(
  req: Request,
  res: Response
) {
  const userId = req.user?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication required");
  }
  const providerCredentialId = req.params.providerCredentialId;
  if (!providerCredentialId) {
    throw new HttpError(400, "Provider credential id is required");
  }

  const result = await refreshSyncfyCredential(userId, providerCredentialId);
  res.json({ refresh: serialize(result) });
}

/** Triggers a resync of the connection backing a single provider account. */
export async function postResyncProviderAccount(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication required");
  }

  const result = await resyncProviderAccount(userId, req.params.id!);
  res.json({ resync: serialize(result) });
}
