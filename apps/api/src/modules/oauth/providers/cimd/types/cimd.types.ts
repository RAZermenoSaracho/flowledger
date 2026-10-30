import type { LookupAddress } from "node:dns";
import type { AgentOptions } from "node:https";

/** Resolver used for the single DNS lookup of a client metadata host; defaults to `dns.promises.lookup`. */
export type CimdLookup = (host: string) => Promise<LookupAddress[]>;

/** Injection points for tests; production callers pass nothing. */
export interface CimdFetchDeps {
  lookup?: CimdLookup;
  /** Extra TLS options (e.g. a test CA) merged into the pinned agent. */
  agentOptions?: AgentOptions;
  /** TCP port to dial instead of 443. */
  port?: number;
}

/** Why a client metadata document was rejected; logged with the host only, never returned to callers. */
export class CimdError extends Error {}
