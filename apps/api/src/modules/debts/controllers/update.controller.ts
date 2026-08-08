import type { BatchSettlementApprovalInput } from "@flowledger/shared";
import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import {
  approveBatchSettlements,
  approveSettlement,
  rejectSettlement,
  settleDebtDirectly
} from "../services/update.service.js";

/** Settles a debt directly, without a separate approval step from the counterparty. */
export async function postSettle(req: Request, res: Response) {
  const result = await settleDebtDirectly(req.user!.id, req.params.id!);
  res.json(serialize(result));
}

/** Approves a pending settlement request and records its transaction. */
export async function postApproveSettlement(req: Request, res: Response) {
  const result = await approveSettlement(
    req.user!.id,
    req.params.id!,
    req.body
  );
  res.json(serialize(result));
}

/** Approves multiple pending settlement requests in one call. */
export async function postBatchApproveSettlements(
  req: Request,
  res: Response
) {
  const body = req.body as BatchSettlementApprovalInput;
  const results = await approveBatchSettlements(req.user!.id, body.approvals);
  res.json({ results: serialize(results) });
}

/** Rejects a pending settlement request. */
export async function postRejectSettlement(req: Request, res: Response) {
  const rejectedRequest = await rejectSettlement(req.user!.id, req.params.id!);
  res.json({ settlementRequest: serialize(rejectedRequest) });
}
