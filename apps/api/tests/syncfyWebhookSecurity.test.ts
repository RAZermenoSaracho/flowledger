import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySyncfyWebhookSignature } from "../src/modules/providers/syncfy/syncfy.webhookSecurity.ts";

const rawBody = Buffer.from('{"events":[{"header":{"event":{"eid":"evt_1"}}}]}');
const signatureKey = "test-syncfy-webhook-key";
const hexSignature = createHmac("sha256", signatureKey)
  .update(rawBody)
  .digest("hex");
const base64Signature = createHmac("sha256", signatureKey)
  .update(rawBody)
  .digest("base64");

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
    signature: "not-the-signature",
    signatureKey
  }),
  "invalid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: undefined,
    signatureKey: undefined
  }),
  "skipped"
);
