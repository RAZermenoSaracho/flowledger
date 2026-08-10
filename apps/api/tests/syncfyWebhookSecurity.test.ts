import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import {
  getSyncfyWebhookSignatureDiagnostics,
  verifySyncfyWebhookSignature
} from "../src/modules/accounts/providers/syncfy/syncfy.webhookSecurity.ts";

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
const base64UrlSignature = createHmac("sha256", signatureKey)
  .update(rawBody)
  .digest("base64url");
const nestedHexSignature = createHmac("sha256", nestedSignatureKey)
  .update(rawBody)
  .digest("hex");
const decodedKeyHexSignature = createHmac(
  "sha256",
  Buffer.from(base64UrlSignatureKey, "base64url")
)
  .update(rawBody)
  .digest("hex");
const productionShapeSignatureKey = Buffer.from(
  "production-shape-decoded-syncfy-webhook-key"
).toString("base64url");
const productionShapeJwk = JSON.stringify({
  kid: "test-key-id",
  kty: "oct",
  k: {
    kty: "oct",
    k: productionShapeSignatureKey
  }
});
const productionShapeBase64UrlSignature = createHmac(
  "sha256",
  Buffer.from(productionShapeSignatureKey, "base64url")
)
  .update(rawBody)
  .digest("base64url");
const productionShapeHexSignature = createHmac(
  "sha256",
  Buffer.from(productionShapeSignatureKey, "base64url")
)
  .update(rawBody)
  .digest("hex");
const productionShapeBase64Signature = createHmac(
  "sha256",
  Buffer.from(productionShapeSignatureKey, "base64url")
)
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
    signature: base64UrlSignature,
    signatureKey
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: `sha256=${base64UrlSignature}`,
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
    signature: productionShapeBase64UrlSignature,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: productionShapeHexSignature,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: productionShapeBase64Signature,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: `"${productionShapeBase64UrlSignature}"`,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: `v1="${productionShapeBase64UrlSignature}"`,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: `t=1781222400; v1="${productionShapeBase64UrlSignature}"`,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: `t=1781222400;v1="${productionShapeBase64UrlSignature}"`,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: `keyId="test-key-id",algorithm="hmac-sha256",signature="${productionShapeBase64UrlSignature}"`,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: `keyId="test-key-id";algorithm="hmac-sha256";signature="${productionShapeBase64UrlSignature}"`,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: `signature=${productionShapeBase64UrlSignature}`,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  verifySyncfyWebhookSignature({
    rawBody,
    signature: `request-signature="${productionShapeBase64UrlSignature}"`,
    signatureKey: productionShapeJwk
  }),
  "valid"
);

assert.equal(
  getSyncfyWebhookSignatureDiagnostics({
    rawBody,
    signature: `t=1781222400; v1="${productionShapeBase64UrlSignature}"`,
    signatureKey: productionShapeJwk
  }).keyShape,
  "json_nested_k"
);

const productionShapeDiagnostics = getSyncfyWebhookSignatureDiagnostics({
  rawBody,
  signature: `signature=${productionShapeBase64UrlSignature}`,
  signatureKey: productionShapeJwk
});
assert.equal(productionShapeDiagnostics.signaturePreview.first6, "signat");
assert.equal(
  productionShapeDiagnostics.signaturePreview.last6,
  productionShapeBase64UrlSignature.slice(-6)
);
assert.deepEqual(productionShapeDiagnostics.verificationCandidatesTried.keyMaterial, [
  "raw_utf8",
  "base64url_decoded"
]);
assert.equal(
  productionShapeDiagnostics.verificationCandidatesTried.digestFormats.includes(
    "base64url"
  ),
  true
);
const serializedDiagnostics = JSON.stringify(productionShapeDiagnostics);
assert.equal(serializedDiagnostics.includes(productionShapeSignatureKey), false);
assert.equal(serializedDiagnostics.includes(productionShapeBase64UrlSignature), false);
assert.equal(serializedDiagnostics.includes(rawBody.toString("utf8")), false);

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
