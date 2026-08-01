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

export async function getConnectors(_req: Request, res: Response) {
  const connectors = await listConnectors();
  res.json({ connectors });
}

export async function getInstitutions(req: Request, res: Response) {
  const institutions = await listInstitutions(
    req.query as InstitutionCatalogQuery
  );
  res.json({ institutions });
}

export async function getConnectionStatusHandler(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication required");
  }

  const connection = await getConnectionStatus(userId, req.params.id!);
  res.json({ connection: serialize(connection) });
}

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
