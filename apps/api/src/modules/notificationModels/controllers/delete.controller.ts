import type { Request, Response } from "express";
import { deleteModel } from "../services/delete.service.js";

/** Deletes one of the caller's models; responds 204. */
export async function deleteModelController(req: Request, res: Response) {
  await deleteModel(req.user!.id, req.params.id!);
  res.status(204).send();
}
