import type { Request, Response } from "express";
import { creditCardBillingQuerySchema } from "@flowledger/shared";
import { serialize } from "../../../utils/serialize.js";
import { getCreditCardBilling } from "../services/creditCard.read.service.js";

/** Returns the billing projection of the authenticated user's credit card `:id` (query: `page`). */
export async function getCreditCard(req: Request, res: Response) {
  const { page } = creditCardBillingQuerySchema.parse(req.query);
  const billing = await getCreditCardBilling(req.user!.id, String(req.params.id), page);
  res.json(serialize(billing));
}
