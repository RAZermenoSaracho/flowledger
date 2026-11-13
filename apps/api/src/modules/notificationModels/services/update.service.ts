import type { UpdateNotificationModelInput } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import type { ModelBindings, ModelSlots } from "../types/notificationModels.types.js";
import { assertActivatable, assertCodeValid } from "./create.service.js";
import { assertBindingsValid, getOwnedModel } from "./read.service.js";

/**
 * Partially updates one of the caller's models; 404 when missing or foreign.
 * Changed code must pass sandbox validation, changed slots/bindings must reference the caller's non-archived records,
 * and the activation rule is re-applied whenever the resulting model is active (all 400 on failure).
 */
export async function updateModel(userId: string, id: string, patch: UpdateNotificationModelInput) {
  const current = await getOwnedModel(userId, id);
  const merged = {
    code: patch.code ?? current.code,
    slots: (patch.slots ?? current.slots) as ModelSlots,
    bindings: (patch.bindings ?? current.bindings) as ModelBindings,
    isActive: patch.isActive ?? current.isActive
  };
  const activating = patch.isActive === true && !current.isActive;

  if (patch.code !== undefined) await assertCodeValid(patch.code);
  if (patch.slots !== undefined || patch.bindings !== undefined) {
    await assertBindingsValid(userId, merged.slots, merged.bindings);
  }
  if (merged.isActive) await assertActivatable(merged, { checkCode: activating && patch.code === undefined });

  return prisma.notificationModel.update({
    where: { id },
    data: {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description ?? null } : {}),
      ...(patch.code !== undefined ? { code: patch.code } : {}),
      ...(patch.slots !== undefined ? { slots: patch.slots as Prisma.InputJsonValue } : {}),
      ...(patch.bindings !== undefined ? { bindings: patch.bindings as Prisma.InputJsonValue } : {}),
      ...(patch.settings !== undefined ? { settings: patch.settings as Prisma.InputJsonValue } : {}),
      ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {})
    }
  });
}
