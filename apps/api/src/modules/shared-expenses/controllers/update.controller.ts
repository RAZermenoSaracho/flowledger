import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { respondToSharedExpense, updateSharedExpense } from "../services/update.service.js";

/** Updates a shared expense's fields and re-derives its participants. */
export async function putSharedExpense(req: Request, res: Response) {
  const sharedExpense = await updateSharedExpense(
    req.user!.id,
    req.params.id!,
    req.body
  );
  res.json({ sharedExpense: serialize(sharedExpense) });
}

/** Accepts the caller's own proposed share(s) (optional body `participantId` narrows to one allocation) of the shared expense in `req.params.id`. */
export async function postAcceptSharedExpense(req: Request, res: Response) {
  const sharedExpense = await respondToSharedExpense(req.user!.id, req.params.id!, "accepted", req.body?.participantId);
  res.json({ sharedExpense: serialize(sharedExpense) });
}

/** Rejects the caller's own proposed share(s) (optional body `participantId` narrows to one allocation) of the shared expense in `req.params.id`. */
export async function postRejectSharedExpense(req: Request, res: Response) {
  const sharedExpense = await respondToSharedExpense(req.user!.id, req.params.id!, "rejected", req.body?.participantId);
  res.json({ sharedExpense: serialize(sharedExpense) });
}
