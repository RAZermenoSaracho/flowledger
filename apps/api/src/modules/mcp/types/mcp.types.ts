import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { VerifiedCredential } from "../../../types/credential.types.js";

/** SDK `AuthInfo` narrowed to what `credentialTokenVerifier` always sets; the only identity source tools may read. */
export type McpAuth = AuthInfo & {
  extra: { userId: string; kind: VerifiedCredential["kind"] };
};
