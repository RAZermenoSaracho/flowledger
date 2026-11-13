import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { updateModel } from "../services/update.service.js";

/** Partially updates one of the caller's models; responds with `{ model }`. */
export async function putModel(req: Request, res: Response) {
  const model = await updateModel(req.user!.id, req.params.id!, req.body);
  res.json({ model: serialize(model) });
}
