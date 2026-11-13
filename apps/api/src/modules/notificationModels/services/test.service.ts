import { notificationProposalSchema, transactionSchema } from "@flowledger/shared";
import { HttpError } from "../../../utils/httpError.js";
import { acquirePlaygroundSlot, parseRules, runScript, validateScript } from "../sandbox/runScript.js";
import type { ModelBindings, ModelSlots, NotificationTestResult } from "../types/notificationModels.types.js";
import { prepareTransactionInput } from "../../transactions/services/prepareTransaction.service.js";
import { invalidResultMessage, mapProposalToTransactionInput } from "../utils/mapProposal.js";
import { getOwnedModel, resolveBindingNames } from "./read.service.js";

/** Creates the shared response when sandbox playground capacity is exhausted. */
export function playgroundBusyError() {
  return new HttpError(503, "Test playground is busy, try again shortly");
}

/** Validates `code` in the sandbox and returns its errors (`line`, `col`, `message`); empty when valid. */
export async function validateCode(userId: string, code: string) {
  const release = acquirePlaygroundSlot(userId);
  if (!release) throw playgroundBusyError();
  try {
    return { errors: await validateScript(code) };
  } finally {
    release();
  }
}

/** Parses `code` into visual rules in the sandbox: `{ rules }`, `{ unsupported }` or `{ errors }`; throws 503 when the playground is busy. */
export function parseCodeToRules(userId: string, code: string) {
  return parseRules(code, userId);
}

/**
 * Runs the model's draft (or saved) code and settings against sample `text` using the model's bindings.
 * Writes nothing and creates no run. 404 for a missing or foreign model, 503 when the playground cap is reached.
 * A proposal comes back with a `transactionPreview` (slot keys resolved to record names, currency resolved exactly as `createTransaction` does) and any
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
  if (!release) throw playgroundBusyError();

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
  if (!parsed.success) {
    return { outcome: "error", error: { message: invalidResultMessage(parsed.error) }, stdout: result.stdout };
  }
  if (parsed.data.kind === "skip") return { outcome: "skip", reason: parsed.data.reason, stdout: result.stdout };

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
  const proposal = parsed.data;
  const fail = (message: string) => ({ outcome: "error" as const, proposal, error: { message }, stdout: result.stdout });
  const checked = transactionSchema.safeParse(mapped.input);
  const { input } = mapped;
  let currency = input.executionCurrency;
  if (checked.success) {
    try {
      currency = (await prepareTransactionInput(userId, checked.data)).executionCurrency;
    } catch (error) {
      if (error instanceof HttpError) return fail(error.message);
      throw error;
    }
  }
  return {
    outcome: "proposal",
    proposal,
    transactionPreview: {
      name: input.name,
      amount: input.amount,
      type: input.type,
      date: input.date,
      executionCurrency: currency,
      ...(proposal.account ? { account: names[proposal.account] } : {}),
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
