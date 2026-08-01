import type { Request, Response } from "express";
import { HttpError } from "../../../utils/httpError.js";
import { serialize } from "../../../utils/serialize.js";
import {
  confirmProviderAccounts,
  createConnection
} from "../services/providerConnections.create.service.js";

export async function postConnection(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication required");
  }

  const connection = await createConnection(userId, req.body as {
    institutionId?: string;
    provider?: string;
  });

  res.status(201).json({ connection });
}

export async function postConfirmAccounts(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    throw new HttpError(401, "Authentication required");
  }

  const accounts = await confirmProviderAccounts(
    userId,
    req.body.accounts as { providerAccountId: string; accountId?: string }[]
  );

  res.status(201).json({ accounts: serialize(accounts) });
}
