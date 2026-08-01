import type { Request, Response } from "express";
import { deleteAccount } from "../services/delete.service.js";

export async function deleteAccountHandler(req: Request, res: Response) {
  await deleteAccount(req.user!.id, req.params.id!);
  res.status(204).send();
}
