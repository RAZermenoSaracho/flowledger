import type { BatchSettlementRequestInput } from "@flowledger/shared";
import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import {
  createBatchSettlementRequests,
  createSettlementRequest
} from "../services/create.service.js";

/** Creates a settlement request against the debt identified by `req.params.id`. */
export async function postSettlementRequest(req: Request, res: Response) {
  const settlementRequest = await createSettlementRequest(
    req.user!.id,
    req.params.id!,
    req.body
  );
  res.status(201).json({ settlementRequest: serialize(settlementRequest) });
}

/** Creates settlement requests for multiple debts in one call. */
export async function postBatchSettlementRequests(
  req: Request,
  res: Response
) {
  const body = req.body as BatchSettlementRequestInput;
  const settlementRequests = await createBatchSettlementRequests(
    req.user!.id,
    body.requests
  );
  res
    .status(201)
    .json({ settlementRequests: serialize(settlementRequests) });
}
