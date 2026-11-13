import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { createModel } from "../services/create.service.js";

/** Creates a notification model owned by the caller; responds 201 with `{ model }`. */
export async function postModel(req: Request, res: Response) {
  const model = await createModel(req.user!.id, req.body);
  res.status(201).json({ model: serialize(model) });
}
