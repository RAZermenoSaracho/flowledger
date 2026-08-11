import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  getSyncfyWebhookSignatureDiagnostics,
  verifySyncfyWebhookSignature
} from "../syncfy.webhookSecurity.js";

const rawBody = Buffer.from('{"events":[{"header":{"event":{"eid":"evt_1"}}}]}');
const signatureKey = "test-syncfy-webhook-key";
const nestedSignatureKey = "nested-syncfy-webhook-key";
const base64UrlSignatureKey = Buffer.from("decoded-syncfy-webhook-key").toString(
  "base64url"
);

const hexSignature = createHmac("sha256", signatureKey).update(rawBody).digest("hex");
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
  k: { kty: "oct", k: productionShapeSignatureKey }
});
const productionKeyBuffer = Buffer.from(productionShapeSignatureKey, "base64url");
const productionShapeBase64UrlSignature = createHmac("sha256", productionKeyBuffer)
  .update(rawBody)
  .digest("base64url");
const productionShapeHexSignature = createHmac("sha256", productionKeyBuffer)
  .update(rawBody)
  .digest("hex");
const productionShapeBase64Signature = createHmac("sha256", productionKeyBuffer)
  .update(rawBody)
  .digest("base64");

describe("verifySyncfyWebhookSignature — no key configured", () => {
  it("returns 'skipped' when neither signature nor key is present", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: undefined,
        signatureKey: undefined
      })
    ).toBe("skipped");
  });
});

describe("verifySyncfyWebhookSignature — plain string key", () => {
  it("accepts a raw hex signature", () => {
    expect(
      verifySyncfyWebhookSignature({ rawBody, signature: hexSignature, signatureKey })
    ).toBe("valid");
  });

  it("accepts an sha256=-prefixed hex signature", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: `sha256=${hexSignature}`,
        signatureKey
      })
    ).toBe("valid");
  });

  it("accepts a base64 signature", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: base64Signature,
        signatureKey
      })
    ).toBe("valid");
  });

  it("accepts a base64url signature", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: base64UrlSignature,
        signatureKey
      })
    ).toBe("valid");
  });

  it("accepts a JSON-string-encoded key (json_string shape)", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: hexSignature,
        signatureKey: JSON.stringify(signatureKey)
      })
    ).toBe("valid");
  });

  it("accepts a nested key object ({ k: '...' })", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: hexSignature,
        signatureKey: JSON.stringify({ k: signatureKey })
      })
    ).toBe("valid");
  });

  it("rejects a tampered/incorrect signature", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: "not-the-signature",
        signatureKey
      })
    ).toBe("invalid");
  });

  it("returns 'invalid' (not 'skipped') when a key is configured but no signature is sent", () => {
    expect(
      verifySyncfyWebhookSignature({ rawBody, signature: undefined, signatureKey })
    ).toBe("invalid");
  });
});

describe("verifySyncfyWebhookSignature — doubly-nested JWK-like key ({ k: { k: '...' } })", () => {
  it("accepts a signature computed from the deeply nested key", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: nestedHexSignature,
        signatureKey: JSON.stringify({ k: { k: nestedSignatureKey } })
      })
    ).toBe("valid");
  });

  it("rejects an incorrect signature against the nested key", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: "not-the-signature",
        signatureKey: JSON.stringify({ k: { k: nestedSignatureKey } })
      })
    ).toBe("invalid");
  });
});

describe("verifySyncfyWebhookSignature — base64url-encoded key material", () => {
  it("accepts a signature computed from the base64url-decoded key", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: decodedKeyHexSignature,
        signatureKey: JSON.stringify({ k: base64UrlSignatureKey })
      })
    ).toBe("valid");
  });
});

describe("verifySyncfyWebhookSignature — production JWK shape (nested k.k, base64url key)", () => {
  it.each([
    ["base64url digest", productionShapeBase64UrlSignature],
    ["hex digest", productionShapeHexSignature],
    ["base64 digest", productionShapeBase64Signature]
  ])("accepts a %s", (_label, signature) => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature,
        signatureKey: productionShapeJwk
      })
    ).toBe("valid");
  });

  it("accepts a quoted signature value", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: `"${productionShapeBase64UrlSignature}"`,
        signatureKey: productionShapeJwk
      })
    ).toBe("valid");
  });

  it("accepts a v1=\"...\" structured signature", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: `v1="${productionShapeBase64UrlSignature}"`,
        signatureKey: productionShapeJwk
      })
    ).toBe("valid");
  });

  it("accepts a t=<ts>; v1=\"...\" structured signature (space-separated)", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: `t=1781222400; v1="${productionShapeBase64UrlSignature}"`,
        signatureKey: productionShapeJwk
      })
    ).toBe("valid");
  });

  it("accepts a t=<ts>;v1=\"...\" structured signature (no space)", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: `t=1781222400;v1="${productionShapeBase64UrlSignature}"`,
        signatureKey: productionShapeJwk
      })
    ).toBe("valid");
  });

  it("accepts a keyId=\"...\",algorithm=\"...\",signature=\"...\" structured signature", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: `keyId="test-key-id",algorithm="hmac-sha256",signature="${productionShapeBase64UrlSignature}"`,
        signatureKey: productionShapeJwk
      })
    ).toBe("valid");
  });

  it("accepts a semicolon-separated keyId/algorithm/signature structured signature", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: `keyId="test-key-id";algorithm="hmac-sha256";signature="${productionShapeBase64UrlSignature}"`,
        signatureKey: productionShapeJwk
      })
    ).toBe("valid");
  });

  it("accepts a bare signature=<value> pair", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: `signature=${productionShapeBase64UrlSignature}`,
        signatureKey: productionShapeJwk
      })
    ).toBe("valid");
  });

  it("accepts a request-signature=\"...\" pair", () => {
    expect(
      verifySyncfyWebhookSignature({
        rawBody,
        signature: `request-signature="${productionShapeBase64UrlSignature}"`,
        signatureKey: productionShapeJwk
      })
    ).toBe("valid");
  });
});

describe("getSyncfyWebhookSignatureDiagnostics", () => {
  it("identifies the nested-k key shape", () => {
    const diagnostics = getSyncfyWebhookSignatureDiagnostics({
      rawBody,
      signature: `t=1781222400; v1="${productionShapeBase64UrlSignature}"`,
      signatureKey: productionShapeJwk
    });
    expect(diagnostics.keyShape).toBe("json_nested_k");
  });

  it("previews the first/last 6 characters of the signature", () => {
    const diagnostics = getSyncfyWebhookSignatureDiagnostics({
      rawBody,
      signature: `signature=${productionShapeBase64UrlSignature}`,
      signatureKey: productionShapeJwk
    });

    expect(diagnostics.signaturePreview.first6).toBe("signat");
    expect(diagnostics.signaturePreview.last6).toBe(
      productionShapeBase64UrlSignature.slice(-6)
    );
  });

  it("lists which key-material candidates were tried", () => {
    const diagnostics = getSyncfyWebhookSignatureDiagnostics({
      rawBody,
      signature: `signature=${productionShapeBase64UrlSignature}`,
      signatureKey: productionShapeJwk
    });

    expect(diagnostics.verificationCandidatesTried.keyMaterial).toEqual([
      "raw_utf8",
      "base64url_decoded"
    ]);
    expect(
      diagnostics.verificationCandidatesTried.digestFormats
    ).toContain("base64url");
  });

  it("reports keyShape 'missing' when no key is configured", () => {
    const diagnostics = getSyncfyWebhookSignatureDiagnostics({
      rawBody,
      signature: undefined,
      signatureKey: undefined
    });
    expect(diagnostics.keyShape).toBe("missing");
  });

  it("never leaks the raw key material, signature, or request body into the diagnostics output", () => {
    const diagnostics = getSyncfyWebhookSignatureDiagnostics({
      rawBody,
      signature: `signature=${productionShapeBase64UrlSignature}`,
      signatureKey: productionShapeJwk
    });
    const serialized = JSON.stringify(diagnostics);

    expect(serialized).not.toContain(productionShapeSignatureKey);
    expect(serialized).not.toContain(productionShapeBase64UrlSignature);
    expect(serialized).not.toContain(rawBody.toString("utf8"));
  });
});
