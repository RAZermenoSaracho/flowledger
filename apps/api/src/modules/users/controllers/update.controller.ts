import type {
  UpdateUserPasswordInput,
  UpdateUserPlanInput,
  UpdateUserProfileInput,
  UpdateUserSidebarSideInput
} from "@flowledger/shared";
import type { Request, Response } from "express";
import { HttpError } from "../../../utils/httpError.js";
import { readMultipartParts } from "../../../utils/multipart.js";
import { publicUser } from "../../../utils/serialize.js";
import {
  maxAvatarBytes,
  updatePassword,
  updatePlan,
  updateProfile,
  updateSidebarSide,
  uploadAvatar
} from "../services/update.service.js";

export async function patchMe(req: Request, res: Response) {
  const input = req.body as UpdateUserProfileInput;
  const user = await updateProfile(req.user!.id, input);
  res.json({ user: publicUser(user) });
}

export async function postAvatar(req: Request, res: Response) {
  if (!req.is("multipart/form-data")) {
    throw new HttpError(415, "Avatar upload must use multipart/form-data");
  }

  const parts = await readMultipartParts(req, maxAvatarBytes + 1024 * 16);
  const avatar = parts.find((part) => part.fieldName === "avatar");

  if (!avatar) {
    throw new HttpError(400, "Avatar image file is required");
  }

  const user = await uploadAvatar(req.user!.id, avatar);
  res.json({ user: publicUser(user) });
}

export async function patchPassword(req: Request, res: Response) {
  const input = req.body as UpdateUserPasswordInput;
  await updatePassword(req.user!.id, input);
  res.status(204).send();
}

export async function patchPlan(req: Request, res: Response) {
  const input = req.body as UpdateUserPlanInput;
  const user = await updatePlan(req.user!.id, input);
  res.json({ user: publicUser(user) });
}

export async function patchSidebarSide(req: Request, res: Response) {
  const input = req.body as UpdateUserSidebarSideInput;
  const user = await updateSidebarSide(req.user!.id, input);
  res.json({ user: publicUser(user) });
}
