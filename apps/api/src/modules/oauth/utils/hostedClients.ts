import { issuerUrl } from "./tokens.js";

/** OAuth callback of Meta AI Muse; the only redirect its hosted client document lists. */
export const MUSE_REDIRECT_URI = "https://agent.meta.ai/api/hatch/oauth/callback";

/** Path, on the API host, of the Client ID Metadata Document FlowLedger serves for Meta AI Muse. */
export const MUSE_CLIENT_DOCUMENT_PATH = "/oauth/clients/meta-muse.json";

/** Muse's OAuth Client ID in this environment: the URL of its hosted client document. */
export const museClientId = () => `${issuerUrl()}${MUSE_CLIENT_DOCUMENT_PATH}`;

/**
 * Client ID Metadata Document for Meta AI Muse, served by FlowLedger because Muse asks for a Client ID
 * instead of hosting one. It goes through the same CIMD fetch, exact redirect matching and consent as any client.
 */
export const museClientDocument = () => ({
  client_id: museClientId(),
  client_name: "Meta AI Muse",
  redirect_uris: [MUSE_REDIRECT_URI],
  grant_types: ["authorization_code", "refresh_token"],
  response_types: ["code"],
  token_endpoint_auth_method: "none"
});
