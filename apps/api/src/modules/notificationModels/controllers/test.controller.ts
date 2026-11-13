import type { Request, Response } from "express";
import { serialize } from "../../../utils/serialize.js";
import { testModel, validateCode } from "../services/test.service.js";

/** Validates submitted script code and responds with `{ errors }`. */
export async function postValidate(req: Request, res: Response) {
  res.json(await validateCode(req.body.code));
}

/** Runs sample text through a model's draft code without persisting anything; responds with the test result. */
export async function postTest(req: Request, res: Response) {
  const result = await testModel(req.user!.id, req.params.id!, req.body);
  res.json(serialize(result));
}
