import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { getAccountHoldings } from "../services/holdings.read.service.js";
import { applyHoldingChanges, refreshAccountHoldings } from "../services/holdings.update.service.js";

/** Returns an account's holdings with valuations and aggregate for the authenticated user. */
export async function getHoldings(req: Request, res: Response) {
  res.json(serialize(await getAccountHoldings(req.user!.id, req.params.id!)));
}

/** Applies an atomic holdings change set and returns the same body as {@link getHoldings}. */
export async function patchHoldings(req: Request, res: Response) {
  res.json(serialize(await applyHoldingChanges(req.user!.id, req.params.id!, req.body)));
}

/** Refreshes the account's due auto-priced security quotes, then returns the same body as {@link getHoldings}. */
export async function postRefreshHoldings(req: Request, res: Response) {
  res.json(serialize(await refreshAccountHoldings(req.user!.id, req.params.id!)));
}
