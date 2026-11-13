import { Prisma } from "@prisma/client";
import { env } from "../../../config/env.js";
import { prisma } from "../../../db/prisma.js";

const MAX_ATTEMPTS = 3;

/**
 * Atomically claims the next queued notification run for `workerId`, or returns `null`.
 *
 * Fair across users and models: users (then models) with fewer running runs go first, ties broken by
 * the oldest queued head; within a model runs are FIFO. Respects the global and per-user concurrency
 * limits from `env`. Runs as one Serializable transaction so concurrent workers cannot over-claim;
 * serialization failures (`P2034`) are retried up to 3 times, after which `null` is returned.
 */
export async function claimNextRun(workerId: string) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const [byUser, byModel] = await Promise.all([
            tx.notificationRun.groupBy({ by: ["userId"], where: { status: "processing" }, _count: { _all: true } }),
            tx.notificationRun.groupBy({ by: ["modelId"], where: { status: "processing" }, _count: { _all: true } })
          ]);
          const userCount = new Map(byUser.map((r) => [r.userId, r._count._all]));
          const modelCount = new Map(byModel.map((r) => [r.modelId, r._count._all]));
          const total = byUser.reduce((sum, r) => sum + r._count._all, 0);
          if (total >= env.NOTIFICATION_PROCESSOR_MAX_CONCURRENT_GLOBAL) return null;

          const heads = await tx.notificationRun.groupBy({
            by: ["userId", "modelId"],
            where: { status: "queued" },
            _min: { receivedAt: true }
          });
          const candidates = heads
            .filter((h) => (userCount.get(h.userId) ?? 0) < env.NOTIFICATION_PROCESSOR_MAX_CONCURRENT_PER_USER)
            .sort(
              (a, b) =>
                (userCount.get(a.userId) ?? 0) - (userCount.get(b.userId) ?? 0) ||
                (modelCount.get(a.modelId) ?? 0) - (modelCount.get(b.modelId) ?? 0) ||
                (a._min.receivedAt?.getTime() ?? 0) - (b._min.receivedAt?.getTime() ?? 0)
            );
          const chosen = candidates[0];
          if (!chosen) return null;

          const run = await tx.notificationRun.findFirst({
            where: { modelId: chosen.modelId, status: "queued" },
            orderBy: [{ receivedAt: "asc" }, { id: "asc" }]
          });
          if (!run) return null;

          const { count } = await tx.notificationRun.updateMany({
            where: { id: run.id, status: "queued" },
            data: { status: "processing", workerId, startedAt: new Date() }
          });
          if (count === 0) return null;

          return tx.notificationRun.findUnique({ where: { id: run.id } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
      if (!retryable || attempt === MAX_ATTEMPTS - 1) {
        if (retryable) return null;
        throw error;
      }
    }
  }
  return null;
}
