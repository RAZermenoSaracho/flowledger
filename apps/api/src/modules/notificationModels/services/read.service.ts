import type { NotificationRunStatus } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { createSieve } from "../../../db/sieve.js";
import { badRequest, notFound } from "../../../utils/httpError.js";
import type { ModelBindings, ModelSlots } from "../types/notificationModels.types.js";
import { parseListQuery } from "../utils/parseListQuery.js";

const modelsSieve = createSieve(prisma.notificationModel, { maxPageSize: 100 });
const runsSieve = createSieve(prisma.notificationRun, { maxPageSize: 100 });

const DEFAULT_PAGINATION = { kind: "offset", page: 1, pageSize: 50 } as const;
const HEALTH_LIVE_MS = 60_000;
const QUEUE_TEXT_PREVIEW = 80;
const TERMINAL: NotificationRunStatus[] = ["completed", "skipped", "failed"];

/** Public path an API key posts notification text to for model `id`. */
export function endpointPathFor(id: string) {
  return `/v1/notification-models/${id}/notifications`;
}

/** Loads the caller's model row or throws 404; the single ownership gate for every model route. */
export async function getOwnedModel(userId: string, id: string) {
  const model = await prisma.notificationModel.findFirst({ where: { id, userId } });
  if (!model) throw notFound("Notification model");
  return model;
}

async function loadBoundRecords(
  userId: string, slots: ModelSlots, bindings: ModelBindings, { activeOnly }: { activeOnly: boolean }
) {
  const activeFilter = activeOnly ? { isArchived: false } : {};
  const kindByKey = new Map(slots.map((slot) => [slot.key, slot.kind]));
  const idsOf = (kind: string) =>
    Object.entries(bindings).filter(([key]) => kindByKey.get(key) === kind).map(([, id]) => id);

  const [accounts, categories, groups] = await Promise.all([
    prisma.account.findMany({ where: { id: { in: idsOf("account") }, userId, ...activeFilter }, select: { id: true, name: true } }),
    prisma.category.findMany({
      where: { id: { in: idsOf("category") }, ...activeFilter, users: { some: { userId } } },
      select: { id: true, name: true }
    }),
    prisma.group.findMany({
      where: { id: { in: idsOf("group") }, ...activeFilter, members: { some: { userId } } },
      select: { id: true, name: true }
    })
  ]);
  return {
    account: new Map(accounts.map((r) => [r.id, r.name])),
    category: new Map(categories.map((r) => [r.id, r.name])),
    group: new Map(groups.map((r) => [r.id, r.name]))
  };
}

/**
 * Checks that each bound id is an existing, non-archived record of its slot's kind owned by (or, for groups, joined by) `userId`.
 * @throws 400 listing the offending slot keys, including bindings whose key is not a declared slot.
 */
export async function assertBindingsValid(userId: string, slots: ModelSlots, bindings: ModelBindings) {
  const kindByKey = new Map(slots.map((slot) => [slot.key, slot.kind]));
  const valid = await loadBoundRecords(userId, slots, bindings, { activeOnly: true });

  const invalid = Object.entries(bindings)
    .filter(([key, id]) => {
      const kind = kindByKey.get(key);
      return !kind || !valid[kind].has(id);
    })
    .map(([key]) => key);
  if (invalid.length) {
    throw badRequest(`Invalid bindings for slots: ${invalid.join(", ")}`, { invalidBindings: invalid });
  }
}

/** Resolves bound record ids to display names (`{ [slotKey]: name }`) for the test preview. Unresolvable bindings are omitted. */
export async function resolveBindingNames(userId: string, slots: ModelSlots, bindings: ModelBindings) {
  const records = await loadBoundRecords(userId, slots, bindings, { activeOnly: false });
  const names = new Map([...records.account, ...records.category, ...records.group]);
  return Object.fromEntries(
    Object.entries(bindings).flatMap(([key, id]) => (names.has(id) ? [[key, names.get(id)!]] : []))
  );
}

async function latestRunStatuses(modelIds: string[]) {
  const rows = await prisma.notificationRun.findMany({
    where: { modelId: { in: modelIds } },
    distinct: ["modelId"],
    orderBy: [{ modelId: "asc" }, { receivedAt: "desc" }],
    select: { modelId: true, status: true }
  });
  return new Map(rows.map((row) => [row.modelId, row.status]));
}

/** Lists the caller's models per a DSQL `query` param, paginated (default page size 50), each with its latest run status. */
export async function listModels(userId: string, rawQuery: string | undefined) {
  const input = parseListQuery(rawQuery);
  const scope = { field: "userId", op: "=" as const, value: userId };
  const result = await modelsSieve.query<{ id: string; [key: string]: unknown }>({
    where: input.where ? { and: [scope, input.where] } : scope,
    sort: input.sort ?? [{ field: "createdAt", direction: "desc" }],
    pagination: input.pagination ?? DEFAULT_PAGINATION
  });
  const statuses = await latestRunStatuses(result.data.map((model) => model.id));
  return {
    ...result,
    data: result.data.map((model) => ({
      ...model,
      endpointPath: endpointPathFor(model.id),
      lastRunStatus: statuses.get(model.id) ?? null
    }))
  };
}

/** Describes whether the library source of a copy has a newer public version, and whether the copy's code was edited locally. */
async function getUpdateInfo(model: { sourceVersionId: string | null; code: string }) {
  const none = { available: false, sourceModelId: null, installedVersion: null, latestVersion: null, latestVersionId: null, localCodeModified: false };
  if (!model.sourceVersionId) return none;

  const installed = await prisma.notificationModelVersion.findUnique({ where: { id: model.sourceVersionId } });
  if (!installed) return none;
  const latest = await prisma.notificationModelVersion.findFirst({
    where: { modelId: installed.modelId, model: { visibility: "public" } },
    orderBy: { version: "desc" },
    select: { id: true, version: true }
  });
  return {
    available: !!latest && latest.version > installed.version,
    sourceModelId: installed.modelId,
    installedVersion: installed.version,
    latestVersion: latest?.version ?? installed.version,
    latestVersionId: latest?.id ?? installed.id,
    localCodeModified: model.code !== installed.code
  };
}

/** Reads one of the caller's models with `endpointPath`, `update` info (including `sourceModelId` and `latestVersionId` for the update flow), latest run status and `queued`/`processing` counts; 404 otherwise. */
export async function getModelById(userId: string, id: string) {
  const model = await getOwnedModel(userId, id);
  const [update, counts, lastRun] = await Promise.all([
    getUpdateInfo(model),
    prisma.notificationRun.groupBy({
      by: ["status"],
      where: { modelId: id, status: { in: ["queued", "processing"] } },
      _count: { _all: true }
    }),
    prisma.notificationRun.findFirst({ where: { modelId: id }, orderBy: { receivedAt: "desc" }, select: { status: true } })
  ]);
  const countOf = (status: NotificationRunStatus) => counts.find((row) => row.status === status)?._count._all ?? 0;
  return {
    ...model,
    endpointPath: endpointPathFor(id),
    update,
    lastRunStatus: lastRun?.status ?? null,
    queued: countOf("queued"),
    processing: countOf("processing")
  };
}

async function listRuns(userId: string, modelId: string, rawQuery: string | undefined, statuses: NotificationRunStatus[], direction: "asc" | "desc") {
  await getOwnedModel(userId, modelId);
  const input = parseListQuery(rawQuery);
  const scope = {
    and: [
      { field: "modelId", op: "=" as const, value: modelId },
      { field: "userId", op: "=" as const, value: userId },
      { field: "status", op: "in" as const, value: statuses }
    ]
  };
  return runsSieve.query<{ text: string | null; dedupeKey: string; workerId: string | null; [key: string]: unknown }>({
    where: input.where ? { and: [...scope.and, input.where] } : scope,
    sort: [{ field: direction === "asc" ? "receivedAt" : "finishedAt", direction }],
    pagination: input.pagination ?? DEFAULT_PAGINATION
  });
}

function toPublicRun({ dedupeKey: _dedupeKey, workerId: _workerId, ...run }: {
  text: string | null; dedupeKey: string; workerId: string | null; [key: string]: unknown
}) {
  return run;
}

/** Lists the model's `queued` and `processing` runs, oldest first, paginated; `text` is cut to its first 80 characters. 404 for a foreign model. */
export async function listQueue(userId: string, modelId: string, rawQuery: string | undefined) {
  const result = await listRuns(userId, modelId, rawQuery, ["queued", "processing"], "asc");
  return {
    ...result,
    data: result.data.map((run) => ({
      ...toPublicRun(run),
      text: run.text === null ? null : run.text.slice(0, QUEUE_TEXT_PREVIEW)
    }))
  };
}

/** Lists the model's terminal runs, newest first, paginated; `text` is `null` once retention has cleared it. 404 for a foreign model. */
export async function listLogs(userId: string, modelId: string, rawQuery: string | undefined) {
  const result = await listRuns(userId, modelId, rawQuery, TERMINAL, "desc");
  return {
    ...result,
    data: result.data.map(toPublicRun)
  };
}

/** Counts notification workers seen within the last 60 seconds. */
export async function countLiveWorkers(now = new Date()) {
  return prisma.notificationWorker.count({
    where: { lastSeenAt: { gte: new Date(now.getTime() - HEALTH_LIVE_MS) } }
  });
}
