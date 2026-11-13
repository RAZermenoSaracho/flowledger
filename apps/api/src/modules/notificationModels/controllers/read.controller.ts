import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { getModelById, listLogs, listModels, listQueue } from "../services/read.service.js";

/** Lists the caller's models per the DSQL `query` param, as `{ data, meta }`. */
export async function getModels(req: Request, res: Response) {
  const result = await listModels(req.user!.id, req.query.query as string | undefined);
  res.json({ data: serialize(result.data), meta: result.meta });
}

/** Reads one of the caller's models with endpoint path, update info and run counts. */
export async function getModel(req: Request, res: Response) {
  const model = await getModelById(req.user!.id, req.params.id!);
  res.json({ model: serialize(model) });
}

/** Lists a model's queued and processing runs, oldest first, as `{ data, meta }`. */
export async function getModelQueue(req: Request, res: Response) {
  const result = await listQueue(req.user!.id, req.params.id!, req.query.query as string | undefined);
  res.json({ data: serialize(result.data), meta: result.meta });
}

/** Lists a model's finished runs, newest first, as `{ data, meta }`. */
export async function getModelLogs(req: Request, res: Response) {
  const result = await listLogs(req.user!.id, req.params.id!, req.query.query as string | undefined);
  res.json({ data: serialize(result.data), meta: result.meta });
}
