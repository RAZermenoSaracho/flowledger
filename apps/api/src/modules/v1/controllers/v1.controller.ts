import type { Request, Response } from "express";
import { capList } from "../../../utils/listCap.js";
import { serialize } from "../../../utils/serialize.js";
import { capDebtLists } from "../../debts/utils/capDebtLists.js";
import { listDebts } from "../../debts/services/read.service.js";
import { listImportedTransactions } from "../../transactions/services/read.service.js";

/** Maximum imported transactions returned per `/v1` response. */
const IMPORTED_LIST_CAP = 100;

/** `GET /v1/debts`: the caller's debts with every list capped at 100 rows and per-list `totals`. */
export async function getV1Debts(req: Request, res: Response) {
  const result = await listDebts(req.user!.id);
  res.json(serialize(capDebtLists(result)));
}

/** `GET /v1/imported-transactions`: the review queue capped at 100 rows; `total` is the untruncated match count. */
export async function getV1ImportedTransactions(req: Request, res: Response) {
  const result = await listImportedTransactions(req.user!.id, req.query.query as string | undefined);
  const { data } = capList(result.importedTransactions, IMPORTED_LIST_CAP);
  res.json({
    importedTransactions: serialize(data),
    total: result.total,
    pendingCount: result.pendingCount
  });
}
