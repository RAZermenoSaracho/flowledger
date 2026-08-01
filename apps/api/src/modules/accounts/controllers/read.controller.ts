import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { listAccounts } from "../services/read.service.js";

export async function getAccounts(req: Request, res: Response) {
  const filters = req.query as {
    includeArchived?: string;
    sortBy?: "name" | "createdAt" | "updatedAt";
    sortDirection?: "asc" | "desc";
    types?: string[];
    sources?: string[];
  };
  const accounts = await listAccounts(req.user!.id, filters);
  res.json({ accounts: serialize(accounts) });
}
