import { cimdDocumentSchema } from "@flowledger/shared";
import { describe, expect, it } from "vitest";
import { MUSE_CLIENT_DOCUMENT_PATH, MUSE_REDIRECT_URI, museClientDocument, museClientId } from "../hostedClients.js";
import { issuerUrl } from "../tokens.js";

describe("museClientDocument", () => {
  it("is a valid public CIMD whose client_id is its own URL and lists only the Muse callback", () => {
    const doc = museClientDocument();
    const parsed = cimdDocumentSchema.parse(doc);
    expect(parsed.client_id).toBe(`${issuerUrl()}${MUSE_CLIENT_DOCUMENT_PATH}`);
    expect(museClientId()).toBe(parsed.client_id);
    expect(parsed.redirect_uris).toEqual([MUSE_REDIRECT_URI]);
    expect(parsed.token_endpoint_auth_method).toBe("none");
  });
});
