import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { updateBillingPeriodOverride } from "../services/creditCard.update.service.js";

/** Sets or resets the closing and/or due date of one billing period (`:key` = `YYYY-MM`) of the authenticated user's credit card `:id`; responds with the recomputed period. */
export async function patchBillingPeriod(req: Request, res: Response) {
  const period = await updateBillingPeriodOverride(
    req.user!.id,
    String(req.params.id),
    String(req.params.key),
    req.body
  );
  res.json(serialize(period));
}
