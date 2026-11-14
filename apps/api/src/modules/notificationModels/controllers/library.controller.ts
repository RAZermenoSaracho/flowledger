import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { getLibraryModel, installModel, listLibrary, publishModel, updateFromSource } from "../services/library.service.js";

/** Publishes the caller's model as its next version; responds with `{ model, version }`. */
export async function postPublish(req: Request, res: Response) {
  const result = await publishModel(req.user!.id, req.params.id!);
  res.json(serialize(result));
}

/** Applies a library version to the caller's copy; responds with `{ model }`. */
export async function postUpdateFromSource(req: Request, res: Response) {
  const model = await updateFromSource(req.user!.id, req.params.id!, req.body);
  res.json({ model: serialize(model) });
}

/** Lists public library entries as `{ data }`. */
export async function getLibrary(req: Request, res: Response) {
  res.json({ data: serialize(await listLibrary(req.user!.id)) });
}

/** Reads one library model's latest version including code, as `{ entry }`. */
export async function getLibraryEntry(req: Request, res: Response) {
  res.json({ entry: serialize(await getLibraryModel(req.user!.id, req.params.modelId!)) });
}

/** Installs a library model as the caller's private copy; responds 201 with `{ model }`. */
export async function postInstall(req: Request, res: Response) {
  const model = await installModel(req.user!.id, req.params.modelId!);
  res.status(201).json({ model: serialize(model) });
}
