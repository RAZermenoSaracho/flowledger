import { notificationProposalSchema, transactionSchema } from "@flowledger/shared";
import { HttpError } from "../../../utils/httpError.js";
import { acquirePlaygroundSlot, runScript, validateScript } from "../sandbox/runScript.js";
import type { ModelBindings, ModelSlots, NotificationTestResult } from "../types/notificationModels.types.js";
import { mapProposalToTransactionInput } from "../utils/mapProposal.js";
import { getOwnedModel, resolveBindingNames } from "./read.service.js";

/** Validates `code` in the sandbox and returns its errors (`line`, `col`, `message`); empty when valid. */
export async function validateCode(code: string) {
  return { errors: await validateScript(code) };
}

/**
 * Runs the model's draft (or saved) code and settings against sample `text` using the model's bindings.
 * Writes nothing and creates no run. 404 for a missing or foreign model, 503 when the playground cap is reached.
 * A proposal comes back with a `transactionPreview` (slot keys resolved to record names) and any
 * `transactionSchema` problems in `validationErrors`; an unbound or unknown slot is an `error` outcome `mapping_missing:<key>`.
 */
export async function testModel(
  userId: string,
  id: string,
  body: { text: string; code?: string; settings?: Record<string, string> },
  now = new Date()
): Promise<NotificationTestResult> {
  const model = await getOwnedModel(userId, id);
  const release = acquirePlaygroundSlot(userId);
  if (!release) throw new HttpError(503, "Test playground is busy, try again shortly");

  let result;
  try {
    result = await runScript({
      code: body.code ?? model.code,
      text: body.text,
      ctx: { received_at: now.toISOString(), settings: body.settings ?? (model.settings as Record<string, string>) }
    });
  } finally {
    release();
  }

  if (result.kind === "error") return { outcome: "error", error: result.error, stdout: result.stdout };
  if (result.kind === "skip") return { outcome: "skip", reason: result.reason, stdout: result.stdout };

  const parsed = notificationProposalSchema.safeParse(result.proposal);
  if (!parsed.success || parsed.data.kind === "skip") {
    return { outcome: "error", error: { message: "invalid result" }, stdout: result.stdout };
  }

  const slots = model.slots as ModelSlots;
  const bindings = model.bindings as ModelBindings;
  const mapped = mapProposalToTransactionInput(parsed.data, bindings, slots, now);
  if ("missingSlot" in mapped) {
    return {
      outcome: "error",
      proposal: parsed.data,
      error: { message: `mapping_missing:${mapped.missingSlot}` },
      stdout: result.stdout
    };
  }

  const names = await resolveBindingNames(userId, slots, bindings);
  const checked = transactionSchema.safeParse(mapped.input);
  const proposal = parsed.data;
  const { input } = mapped;
  return {
    outcome: "proposal",
    proposal,
    transactionPreview: {
      name: input.name,
      amount: input.amount,
      type: input.type,
      date: input.date,
      executionCurrency: input.executionCurrency,
      account: names[proposal.account],
      ...(proposal.kind === "transfer" ? { transferToAccount: names[proposal.to_account] } : {}),
      ...(proposal.category ? { category: names[proposal.category] } : {}),
      ...(proposal.group ? { group: names[proposal.group] } : {}),
      ...(input.destinationAmount ? { destinationAmount: input.destinationAmount } : {}),
      ...(input.notes ? { notes: input.notes } : {})
    },
    ...(checked.success
      ? {}
      : { validationErrors: checked.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) }),
    stdout: result.stdout
  };
}
