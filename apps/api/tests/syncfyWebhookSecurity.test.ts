import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySyncfyWebhookSignature } from "../src/modules/providers/syncfy/syncfy.webhookSecurity.ts";

const rawBody = Buffer.from('{"events":[{"header":{"event":{"eid":"evt_1"}}}]}');
const signatureKey = "test-syncfy-webhook-key";
const nestedSignatureKey = "nested-syncfy-webhook-key";
const base64UrlSignatureKey = Buffer.from("decoded-syncfy-webhook-key").toString(
  "base64url"
);
const hexSignature = createHmac("sha256", signatureKey)
  .update(rawBody)
  .digest("hex");
const base64Signature = createHmac("sha256", signatureKey)
  .update(rawBody)
  .digest("base64");
const nestedHexSignature = createHmac("sha256", nestedSignatureKey)
  .update(rawBody)
  .digest("hex");
const decodedKeyHexSignature = createHmac(
  "sha256",
  Buffer.from(base64UrlSignatureKey, "base64url")
)
  .update(rawBody)
  .digest("hex");

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: hexSignature,
    signatureKey
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: `sha256=${hexSignature}`,
    signatureKey
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: base64Signature,
    signatureKey
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: hexSignature,
    signatureKey: JSON.stringify(signatureKey)
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: hexSignature,
    signatureKey: JSON.stringify({ k: signatureKey })
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: "not-the-signature",
    signatureKey
  }),
  "invalid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: nestedHexSignature,
    signatureKey: JSON.stringify({ k: { k: nestedSignatureKey } })
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: "not-the-signature",
    signatureKey: JSON.stringify({ k: { k: nestedSignatureKey } })
  }),
  "invalid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: decodedKeyHexSignature,
    signatureKey: JSON.stringify({ k: base64UrlSignatureKey })
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: undefined,
    signatureKey: undefined
  }),
  "skipped"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: undefined,
    signatureKey
  }),
  "invalid"
);
