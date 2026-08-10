import type { Request, Response } from "express";
import { HttpError } from "../../../utils/httpError.js";
import { serialize } from "../../../utils/serialize.js";
import {
  getConnectionStatus,
  listConnectors,
  listInstitutions,
  listProviderAccounts
} from "../services/providerConnections.read.service.js";

type InstitutionCatalogQuery = {
  q?: string;
  provider?: string;
  country?: string;
  category?: string;
};

/** Lists all available provider connectors across registered providers. */
export async function getConnectors(_req: Request, res: Response) {
  const connectors = await listConnectors();
  res.json({ connectors });
}

/** Lists provider institutions matching the query/country/category filters. */
export async function getInstitutions(req: Request, res: Response) {
  const institutions = await listInstitutions(
    req.query as InstitutionCatalogQuery
  );
  res.json({ institutions });
}

/** Returns the current status of a provider connection owned by the authenticated user. */
export async function getConnectionStatusHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication required");
  }

  const connection = await getConnectionStatus(userId, req.params.id!);
  res.json({ connection: serialize(connection) });
}

/** Lists the authenticated user's provider accounts, optionally filtered to unlinked ones via `status=unlinked`. */
export async function getProviderAccounts(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication required");
  }

  const accounts = await listProviderAccounts(userId, {
    status: req.query.status as string | undefined
  });
  res.json({ accounts: serialize(accounts) });
}
