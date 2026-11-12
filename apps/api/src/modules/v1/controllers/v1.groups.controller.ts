import type { Request, Response } from "express";
import { capList } from "../../../utils/listCap.js";
import { serialize } from "../../../utils/serialize.js";
import { getMemberGroup } from "../../groups/services/read.service.js";
import { createSharedExpense } from "../../shared-expenses/services/create.service.js";
import {
  assertOwnedSharingTransaction,
  listSharedExpenses
} from "../../shared-expenses/services/read.service.js";

/** Maximum shared expenses returned per `/v1` list response. */
const SHARED_EXPENSES_CAP = 100;

/** `GET /v1/shared-expenses`: shared expenses the caller owns or participates in, capped at 100 rows; `total` is the untruncated count. */
export async function getV1SharedExpenses(req: Request, res: Response) {
  const rows = await listSharedExpenses(req.user!.id, req.query.query as string | undefined);
  const { data, total } = capList(rows, SHARED_EXPENSES_CAP);
  res.json({ sharedExpenses: serialize(data), total });
}

/** Creates a shared expense on any owned transaction, proposing app-user shares and notifying participants. */
export async function postV1SharedExpense(req: Request, res: Response) {
  await assertOwnedSharingTransaction(req.user!.id, req.body.transactionId);
  const sharedExpense = await createSharedExpense(req.user!.id, req.body);
  res.status(201).json({ sharedExpense: serialize(sharedExpense) });
}

/** `GET /v1/groups/:id`: one group with members for a member caller; 404 for non-members and unknown ids. */
export async function getV1Group(req: Request, res: Response) {
  const group = await getMemberGroup(req.user!.id, req.params.id!);
  res.json({ group: serialize(group) });
}
