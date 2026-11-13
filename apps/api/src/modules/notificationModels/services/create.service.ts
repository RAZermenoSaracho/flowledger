import type { CreateNotificationModelInput } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { badRequest } from "../../../utils/httpError.js";
import { validateScript } from "../sandbox/runScript.js";
import type { ModelBindings, ModelSlots } from "../types/notificationModels.types.js";
import { assertRequiredBound } from "../utils/bindings.js";
import { assertBindingsValid } from "./read.service.js";

/** Throws 400 with `details.errors` (line/col/message) when `code` fails sandbox validation; empty code is not checked here. */
export async function assertCodeValid(code: string) {
  if (code === "") return;
  const errors = await validateScript(code);
  if (errors.length) throw badRequest("Script is invalid", { errors });
}

/**
 * Enforces the activation rule: non-empty valid code and every required slot bound.
 * @throws 400 listing the unbound slot keys in `details.unboundSlots`, or the code errors.
 */
export async function assertActivatable(
  state: { code: string; slots: ModelSlots; bindings: ModelBindings },
  options: { checkCode: boolean }
) {
  if (state.code === "") throw badRequest("Cannot activate a model without code");
  if (options.checkCode) await assertCodeValid(state.code);

  assertRequiredBound(state.slots, state.bindings);
}

/** Creates a model for `userId` (inactive unless the body activates it, subject to the activation rule); rejects invalid code and foreign bindings with 400. */
export async function createModel(userId: string, input: CreateNotificationModelInput) {
  const { slots, bindings } = input;

  await assertCodeValid(input.code);
  await assertBindingsValid(userId, slots, bindings);
  if (input.isActive) await assertActivatable(input, { checkCode: false });

  return prisma.notificationModel.create({
    data: {
      userId,
      name: input.name,
      description: input.description ?? null,
      code: input.code,
      slots: slots as Prisma.InputJsonValue,
      bindings: bindings as Prisma.InputJsonValue,
      settings: input.settings as Prisma.InputJsonValue,
      isActive: input.isActive,
      visibility: input.visibility
    }
  });
}
