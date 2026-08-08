import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  SyncfySignatureVerification,
  SyncfyWebhookSignatureDiagnostics
} from "./types/syncfy.types.js";

type SyncfySignatureKeyInput =
  | string
  | {
      k?: string | { k?: string };
    };

function parseSignatureKey(signatureKey: string | undefined): {
  secret?: string;
  keyShape: SyncfyWebhookSignatureDiagnostics["keyShape"];
} | undefined {
  if (!signatureKey?.trim()) return undefined;

  const trimmedKey = signatureKey.trim();

  try {
    const parsed = JSON.parse(trimmedKey) as SyncfySignatureKeyInput;

    if (typeof parsed === "string") {
      return { secret: parsed, keyShape: "json_string" };
    }

    if (typeof parsed.k === "string") {
      return { secret: parsed.k, keyShape: "json_k" };
    }

    if (
      parsed.k &&
      typeof parsed.k === "object" &&
      typeof parsed.k.k === "string"
    ) {
      return { secret: parsed.k.k, keyShape: "json_nested_k" };
    }

    return { secret: trimmedKey, keyShape: "json_other" };
  } catch {
    return { secret: trimmedKey, keyShape: "plain" };
  }
}

function extractSignatureSecret(signatureKey: string | undefined) {
  return parseSignatureKey(signatureKey)?.secret;
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

function getCandidateSecretKinds(signatureKey: string | undefined) {
  const secret = extractSignatureSecret(signatureKey);
  if (!secret) return [];

  const kinds = ["raw_utf8"];

  if (looksLikeBase64Url(secret)) {
    try {
      const decoded = Buffer.from(secret, "base64url");
      if (decoded.length > 0 && !decoded.equals(Buffer.from(secret, "utf8"))) {
        kinds.push("base64url_decoded");
      }
    } catch {
      // Keep the candidate-kind list conservative for malformed material.
    }
  }

  return kinds;
}

function getCandidateSignatures(signatureHeader: string | undefined) {
  if (!signatureHeader) return [];

  const unquote = (value: string) =>
    value.replace(/^"+|"+$/g, "").replace(/^'+|'+$/g, "");
  const candidates = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .flatMap((part) => {
      const partCandidates = [part, unquote(part)];
      const valueMatches = part.matchAll(/(?:^|[;\s])[^=;\s,]+=(?:"([^"]+)"|'([^']+)'|([^;\s,]+))/g);

      for (const match of valueMatches) {
        const value = match[1] ?? match[2] ?? match[3];
        if (value) partCandidates.push(value, unquote(value));
      }

      if (part.includes("=")) {
        const value = part.slice(part.indexOf("=") + 1).trim();
        partCandidates.push(value, unquote(value));
      }

      return partCandidates;
    })
    .filter(Boolean);

  return candidates.filter(
    (candidate, index) => candidates.indexOf(candidate) === index
  );
}

function safeEqualString(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

/** Verifies a Syncfy webhook's HMAC signature against the configured signing key, trying multiple key/secret and digest encodings since Syncfy's format isn't fully documented; returns `"skipped"` if no key is configured. */
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
    const expectedBase64Url = createHmac("sha256", secret)
      .update(body)
      .digest("base64url");

    return candidates.some(
      (candidate) =>
        safeEqualString(candidate, expectedHex) ||
        safeEqualString(candidate, expectedBase64) ||
        safeEqualString(candidate, expectedBase64Url) ||
        safeEqualString(candidate, `sha256=${expectedHex}`) ||
        safeEqualString(candidate, `sha256=${expectedBase64}`) ||
        safeEqualString(candidate, `sha256=${expectedBase64Url}`)
    );
  });

  return valid ? "valid" : "invalid";
}

/** Computes non-secret diagnostics (shapes, lengths, candidate counts) about a webhook signature check, for logging when verification fails. */
export function getSyncfyWebhookSignatureDiagnostics(input: {
  rawBody: Buffer | undefined;
  signature: string | undefined;
  signatureKey: string | undefined;
}): SyncfyWebhookSignatureDiagnostics {
  const signature = input.signature ?? "";
  const parsedKey = parseSignatureKey(input.signatureKey);
  const parsedSignatureCandidateCount = getCandidateSignatures(signature).length;

  return {
    bodyBytes: input.rawBody?.length ?? 0,
    hasSignature: signature.length > 0,
    signatureLength: signature.length,
    signaturePreview: {
      first6: signature.length > 0 ? signature.slice(0, 6) : null,
      last6: signature.length > 0 ? signature.slice(-6) : null
    },
    signatureShape: {
      hasSha256Prefix: signature.includes("sha256="),
      hasKeyValue: signature.includes("="),
      hasComma: signature.includes(","),
      hasSemicolon: signature.includes(";"),
      hasQuotes: signature.includes("\"") || signature.includes("'"),
      dotSegmentCount: signature ? signature.split(".").length : 0
    },
    keyShape: parsedKey?.keyShape ?? "missing",
    verificationCandidatesTried: {
      keyMaterial: getCandidateSecretKinds(input.signatureKey),
      signatureParsers: [
        "raw_header",
        "comma_parts",
        "key_value_values",
        "quoted_values"
      ],
      digestFormats: [
        "hex",
        "base64",
        "base64url",
        "sha256=hex",
        "sha256=base64",
        "sha256=base64url"
      ],
      parsedSignatureCandidateCount
    }
  };
}
