import type { UpdateFromSourceInput } from "@flowledger/shared";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { badRequest, notFound } from "../../../utils/httpError.js";
import type { ModelBindings, ModelSlots } from "../types/notificationModels.types.js";
import { assertRequiredBound } from "../utils/bindings.js";
import { assertBindingsValid } from "./read.service.js";

const LIBRARY_VERSION_SELECT = {
  id: true,
  modelId: true,
  version: true,
  name: true,
  description: true,
  slots: true,
  settings: true,
  createdAt: true
} as const;

const LATEST_VERSION = { orderBy: { version: "desc" }, take: 1 } as const;
const AUTHOR = { select: { username: true } } as const;

/** Flattens a public model plus its latest version into a library entry; the author is exposed by username only. */
function toLibraryEntry(
  model: { id: string; user: { username: string } },
  version: { id: string; version: number; name: string; description: string | null; slots: unknown; settings: unknown; createdAt: Date }
) {
  return {
    modelId: model.id,
    versionId: version.id,
    version: version.version,
    name: version.name,
    description: version.description,
    slots: version.slots,
    settings: version.settings,
    publishedAt: version.createdAt,
    author: { username: model.user.username }
  };
}

/**
 * Publishes the caller's model: creates immutable version `max + 1` (name, description, code, slots, settings; never bindings) and sets it public, in one transaction.
 * @throws 404 when the model is missing or foreign.
 */
export async function publishModel(userId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    const model = await tx.notificationModel.findFirst({ where: { id, userId } });
    if (!model) throw notFound("Notification model");
    const last = await tx.notificationModelVersion.aggregate({ where: { modelId: id }, _max: { version: true } });
    const version = await tx.notificationModelVersion.create({
      data: {
        modelId: id,
        version: (last._max.version ?? 0) + 1,
        name: model.name,
        description: model.description,
        code: model.code,
        slots: model.slots as Prisma.InputJsonValue,
        settings: model.settings as Prisma.InputJsonValue
      }
    });
    const published = await tx.notificationModel.update({ where: { id }, data: { visibility: "public" } });
    return { model: published, version };
  });
}

/** Lists public models with at least one version as library entries (latest version, no code), newest publication first. */
export async function listLibrary() {
  const models = await prisma.notificationModel.findMany({
    where: { visibility: "public", versions: { some: {} } },
    select: { id: true, user: AUTHOR, versions: { ...LATEST_VERSION, select: LIBRARY_VERSION_SELECT } }
  });
  return models
    .map((model) => toLibraryEntry(model, model.versions[0]!))
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}

async function findPublicLatest(modelId: string) {
  const model = await prisma.notificationModel.findFirst({
    where: { id: modelId, visibility: "public", versions: { some: {} } },
    select: { id: true, user: AUTHOR, versions: { ...LATEST_VERSION } }
  });
  if (!model) throw notFound("Library model");
  return model;
}

/** Reads one public model's latest version including its code, for viewing before install; 404 when private or never published. */
export async function getLibraryModel(modelId: string) {
  const model = await findPublicLatest(modelId);
  const version = model.versions[0]!;
  return { ...toLibraryEntry(model, version), code: version.code };
}

/** Installs the latest version of a public model as the caller's private, inactive copy with empty bindings and `sourceVersionId` set; 404 when not in the library. */
export async function installModel(userId: string, modelId: string) {
  const model = await findPublicLatest(modelId);
  const version = model.versions[0]!;
  return prisma.notificationModel.create({
    data: {
      userId,
      name: version.name,
      description: version.description,
      code: version.code,
      slots: version.slots as Prisma.InputJsonValue,
      settings: version.settings as Prisma.InputJsonValue,
      bindings: {},
      isActive: false,
      visibility: "private",
      sourceVersionId: version.id
    }
  });
}

/**
 * Applies a published version of the copy's source model to the caller's copy: code, description and slots from the version, user's name kept,
 * settings merged (user values for surviving keys, new keys defaulted, removed keys dropped), bindings kept where key and kind are unchanged plus `input.bindings`.
 * @throws 404 for a foreign model or a version that is not a public version of the copy's source; 400 for a model without a source or with required slots left unbound (`details.unboundSlots`).
 */
export async function updateFromSource(userId: string, id: string, input: UpdateFromSourceInput) {
  const current = await prisma.notificationModel.findFirst({
    where: { id, userId },
    include: { sourceVersion: { select: { modelId: true } } }
  });
  if (!current) throw notFound("Notification model");
  if (!current.sourceVersion) throw badRequest("This model has no library source");

  const version = await prisma.notificationModelVersion.findFirst({
    where: { id: input.versionId, modelId: current.sourceVersion.modelId, model: { visibility: "public" } }
  });
  if (!version) throw notFound("Library version");

  const newSlots = version.slots as ModelSlots;
  const oldKindByKey = new Map((current.slots as ModelSlots).map((slot) => [slot.key, slot.kind]));
  const oldBindings = current.bindings as ModelBindings;
  const oldSettings = current.settings as Record<string, string>;

  const bindings: ModelBindings = {};
  for (const slot of newSlots) {
    const kept = oldKindByKey.get(slot.key) === slot.kind ? oldBindings[slot.key] : undefined;
    const bound = input.bindings?.[slot.key] ?? kept;
    if (bound) bindings[slot.key] = bound;
  }
  const settings = Object.fromEntries(
    Object.entries(version.settings as Record<string, string>).map(([key, fallback]) => [key, oldSettings[key] ?? fallback])
  );

  assertRequiredBound(newSlots, bindings);
  await assertBindingsValid(userId, newSlots, bindings);

  return prisma.notificationModel.update({
    where: { id },
    data: {
      description: version.description,
      code: version.code,
      slots: newSlots as Prisma.InputJsonValue,
      settings,
      bindings,
      sourceVersionId: version.id
    }
  });
}
