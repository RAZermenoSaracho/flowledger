import { createHmac, timingSafeEqual } from "node:crypto";

export type SyncfySignatureVerification = "valid" | "invalid" | "skipped";

function getCandidateSignatures(signatureHeader: string | undefined) {
  if (!signatureHeader) return [];

  return signatureHeader
    .split(",")
    .map((part) => part.trim())
    .flatMap((part) => {
      const value = part.includes("=") ? part.split("=").pop()?.trim() : part;
      const candidates = [part];
      if (value && value !== part) candidates.push(value);

      return candidates;
    })
    .filter(Boolean);
}

function safeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function verifySyncfyWebhookSignature(input: {
  rawBody: Buffer | undefined;
  signature: string | undefined;
  signatureKey: string | undefined;
}): SyncfySignatureVerification {
  if (!input.signatureKey) {
    return "skipped";
  }

  const body = input.rawBody ?? Buffer.from("");
  const expectedHex = createHmac("sha256", input.signatureKey)
    .update(body)
    .digest("hex");
  const expectedBase64 = createHmac("sha256", input.signatureKey)
    .update(body)
    .digest("base64");
  const candidates = getCandidateSignatures(input.signature);
  const valid = candidates.some(
    (candidate) =>
      safeEqualString(candidate, expectedHex) ||
      safeEqualString(candidate, expectedBase64) ||
      safeEqualString(candidate, `sha256=${expectedHex}`)
  );

  return valid ? "valid" : "invalid";
}
