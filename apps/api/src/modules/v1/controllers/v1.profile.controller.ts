import type { UpdateUserPreferencesInput } from "@flowledger/shared";
import type { Request, Response } from "express";
import { publicUser } from "../../../utils/serialize.js";
import { updatePreferences } from "../../users/services/preferences.service.js";

/** `PATCH /v1/me`: updates only the caller's name and preferred currency; email, password and plan are not reachable. */
export async function patchV1Me(req: Request, res: Response) {
  const user = await updatePreferences(req.user!.id, req.body as UpdateUserPreferencesInput);
  res.json({ user: publicUser(user) });
}
