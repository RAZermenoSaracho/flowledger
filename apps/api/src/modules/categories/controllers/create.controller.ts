import type { Request, Response } from "express";
import { createCategory } from "../services/create.service.js";

export async function postCategory(req: Request, res: Response) {
  const category = await createCategory(req.user!.id, req.body);
  res.status(201).json({ category });
}
