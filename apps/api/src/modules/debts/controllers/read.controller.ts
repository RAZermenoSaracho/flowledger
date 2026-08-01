import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { listDebts } from "../services/read.service.js";

export async function getDebts(req: Request, res: Response) {
  const result = await listDebts(req.user!.id);
  res.json(serialize(result));
}
