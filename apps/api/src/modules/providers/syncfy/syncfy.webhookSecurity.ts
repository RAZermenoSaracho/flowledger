import { createHmac, timingSafeEqual } from "node:crypto";

export type SyncfySignatureVerification = "valid" | "invalid" | "skipped";

type SyncfySignatureKeyInput =
  | string
  | {
      k?: string | { k?: string };
    };

function extractSignatureSecret(signatureKey: string | undefined) {
  if (!signatureKey?.trim()) return undefined;

  const trimmedKey = signatureKey.trim();

  try {
    const parsed = JSON.parse(trimmedKey) as SyncfySignatureKeyInput;

    if (typeof parsed === "string") return parsed;

    if (typeof parsed.k === "string") return parsed.k;

    if (
      parsed.k &&
      typeof parsed.k === "object" &&
      typeof parsed.k.k === "string"
    ) {
      return parsed.k.k;
    }
  } catch {
    return trimmedKey;
  }

  return trimmedKey;
}

function looksLikeBase64Url(value: string) {
  return (
    value.length >= 16 &&
    /^[A-Za-z0-9_-]+={0,2}$/.test(value)
  );
}

function getCandidateSecrets(signatureKey: string | undefined) {
  const secret = extractSignatureSecret(signatureKey);
  if (!secret) return [];

  const candidates = [Buffer.from(secret, "utf8")];

  if (looksLikeBase64Url(secret)) {
    try {
      const decoded = Buffer.from(secret, "base64url");
      if (decoded.length > 0) candidates.push(decoded);
    } catch {
      // Keep the original string candidate. Invalid base64url material is not fatal.
    }
  }

  return candidates.filter(
    (candidate, index) =>
      candidates.findIndex((other) => other.equals(candidate)) === index
  );
}

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
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

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
  const secrets = getCandidateSecrets(input.signatureKey);

  if (secrets.length === 0) {
    return "skipped";
  }

  const body = input.rawBody ?? Buffer.from("");
  const candidates = getCandidateSignatures(input.signature);

  const valid = secrets.some((secret) => {
    const expectedHex = createHmac("sha256", secret).update(body).digest("hex");
    const expectedBase64 = createHmac("sha256", secret)
      .update(body)
      .digest("base64");

    return candidates.some(
      (candidate) =>
        safeEqualString(candidate, expectedHex) ||
        safeEqualString(candidate, expectedBase64) ||
        safeEqualString(candidate, `sha256=${expectedHex}`)
    );
  });

  return valid ? "valid" : "invalid";
}
