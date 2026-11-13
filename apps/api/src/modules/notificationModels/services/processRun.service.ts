import { notificationProposalSchema, transactionSchema } from "@flowledger/shared";
import type { NotificationRun, Prisma } from "@prisma/client";
import { prisma } from "../../../db/prisma.js";
import { HttpError } from "../../../utils/httpError.js";
import { createTransaction } from "../../transactions/services/create.service.js";
import { runScript } from "../sandbox/runScript.js";
import type { ModelBindings, ModelSlots } from "../types/notificationModels.types.js";
import { invalidResultMessage, mapProposalToTransactionInput } from "../utils/mapProposal.js";

type ClaimedRun = Pick<NotificationRun, "id" | "userId" | "modelId" | "text" | "receivedAt" | "workerId">;

/** Terminal outcome of {@link processRun}. */
export type RunOutcome = "completed" | "skipped" | "failed";

const REASON_MAX = 500;

/**
 * Executes one claimed (`processing`) run end to end and moves it to a terminal status.
 * Every terminal update is guarded by `{ id, status: "processing", workerId }`; the transaction is
 * created in the same DB transaction as the `completed` update, so a guard miss rolls it back.
 * Rejects with an `AbortError` when `signal` aborts the sandbox, leaving the run `processing` for the caller to requeue.
 */
export async function processRun(run: ClaimedRun, options: { signal?: AbortSignal } = {}): Promise<RunOutcome> {
  const guard = { id: run.id, status: "processing" as const, workerId: run.workerId };
  const finish = async (status: RunOutcome, reason: string | null, extra: Prisma.NotificationRunUncheckedUpdateManyInput = {}, db: Prisma.TransactionClient = prisma) => {
    const { count } = await db.notificationRun.updateMany({
      where: guard,
      data: { status, reason: reason?.slice(0, REASON_MAX) ?? null, finishedAt: new Date(), ...extra }
    });
    if (count === 0) throw new Error("run no longer owned by this worker");
    return status;
  };

  const model = await prisma.notificationModel.findFirst({ where: { id: run.modelId, userId: run.userId } });
  if (!model?.isActive) return finish("skipped", "model_inactive");

  const result = await runScript(
    {
      code: model.code,
      text: run.text ?? "",
      ctx: { received_at: run.receivedAt.toISOString(), settings: model.settings as Record<string, string> }
    },
    options
  );
  if (result.kind === "skip") return finish("skipped", result.reason);
  if (result.kind === "error") {
    const line = result.error.line ? ` (line ${result.error.line})` : "";
    return finish("failed", `${result.error.message}${line}`);
  }

  const parsed = notificationProposalSchema.safeParse(result.proposal);
  if (!parsed.success) return finish("failed", invalidResultMessage(parsed.error));
  if (parsed.data.kind === "skip") return finish("skipped", parsed.data.reason);
  const proposal = parsed.data as Prisma.InputJsonValue;

  const mapped = mapProposalToTransactionInput(
    parsed.data,
    model.bindings as ModelBindings,
    model.slots as unknown as ModelSlots,
    run.receivedAt
  );
  if ("missingSlot" in mapped) return finish("failed", `mapping_missing:${mapped.missingSlot}`, { proposal });
  const input = transactionSchema.safeParse(mapped.input);
  if (!input.success) return finish("failed", `invalid_transaction: ${input.error.issues[0]?.message ?? "invalid"}`, { proposal });

  try {
    return await prisma.$transaction(async (tx) => {
      const current = await tx.notificationModel.findFirst({ where: { id: run.modelId, userId: run.userId }, select: { isActive: true } });
      if (!current?.isActive) return finish("skipped", "model_inactive", {}, tx);
      const created = await createTransaction(run.userId, input.data, tx);
      return finish("completed", null, { proposal, transactionId: created.id }, tx);
    });
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    return finish("failed", error.message, { proposal });
  }
}
