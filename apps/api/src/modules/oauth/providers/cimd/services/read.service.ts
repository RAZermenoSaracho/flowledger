import { cimdDocumentSchema } from "@flowledger/shared";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import dns from "node:dns";
import https from "node:https";
import { isIP } from "node:net";
import { CimdError, type CimdFetchDeps, type CimdLookup } from "../types/cimd.types.js";
import { parseClientIdUrl } from "../utils/clientUrl.js";
import { isPublicAddress } from "../utils/ipGuard.js";

const FETCH_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 64 * 1024;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;

const defaultLookup: CimdLookup = (host) => dns.promises.lookup(host, { all: true, verbatim: true });

const cache = new Map<string, { client: OAuthClientInformationFull; expiresAt: number }>();

/** Empties the success cache; for tests. */
export function clearCimdCache() {
  cache.clear();
}

/** Resolves `host` once and returns the address to dial, rejecting if the set is empty or any answer is non-public. */
async function resolvePinnedAddress(host: string, lookup: CimdLookup) {
  const bare = host.replace(/^\[|\]$/g, "");
  const addresses = isIP(bare) ? [bare] : (await lookup(host)).map((a) => a.address);

  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new CimdError("non-public address");
  }
  return addresses[0]!;
}

/** Performs the pinned HTTPS GET, enforcing status, content type, deadline and size cap; returns the body text. */
function pinnedGet(url: URL, address: string, deps: CimdFetchDeps): Promise<string> {
  const family = isIP(address);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const agent = new https.Agent({
    keepAlive: false,
    autoSelectFamily: false,
    ...deps.agentOptions,
    // The only address ever dialled is the one validated by resolvePinnedAddress; no second DNS query happens.
    lookup: ((_h: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) =>
      options?.all ? cb(null, [{ address, family }]) : cb(null, address, family)) as never
  });

  return new Promise<string>((resolve, reject) => {
    const req = https.request(
      url,
      {
        agent,
        method: "GET",
        servername: isIP(host) ? undefined : host,
        port: deps.port ?? 443,
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      },
      (res) => {
        const type = res.headers["content-type"] ?? "";
        if (res.statusCode !== 200) {
          res.destroy();
          reject(new CimdError(`status ${res.statusCode}`));
          return;
        }
        if (!type.toLowerCase().startsWith("application/json")) {
          res.destroy();
          reject(new CimdError("wrong content type"));
          return;
        }

        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BODY_BYTES) {
            res.destroy();
            reject(new CimdError("body too large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    req.end();
  }).finally(() => agent.destroy());
}

/**
 * Fetches and validates the Client ID Metadata Document at `clientId` (SSRF-safe: single DNS
 * resolution validated as a set, connection pinned to that address, no redirects, 5 s total, 64 KB cap).
 * Throws {@link CimdError} for any rejection; callers must not forward its message to clients.
 */
export async function fetchClientMetadata(
  clientId: string,
  deps: CimdFetchDeps = {}
): Promise<OAuthClientInformationFull> {
  const url = parseClientIdUrl(clientId);
  const address = await resolvePinnedAddress(url.hostname, deps.lookup ?? defaultLookup);
  const body = await pinnedGet(url, address, deps);

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new CimdError("invalid JSON");
  }

  const parsed = cimdDocumentSchema.safeParse(json);
  if (!parsed.success) throw new CimdError("invalid document");

  const doc = parsed.data;
  if (doc.client_id !== clientId) throw new CimdError("client_id mismatch");

  // Public clients only: a document that also lists "none" among its supported methods (ChatGPT declares private_key_jwt) is
  // accepted and treated as public, because PKCE protects the code and no client secret exists to check.
  const method = doc.token_endpoint_auth_method;
  if (
    method !== undefined &&
    method !== "none" &&
    !doc.token_endpoint_auth_methods_supported?.includes("none")
  ) {
    throw new CimdError("unsupported token_endpoint_auth_method");
  }

  return {
    client_id: doc.client_id,
    client_name: doc.client_name ?? url.hostname,
    redirect_uris: doc.redirect_uris,
    token_endpoint_auth_method: "none"
  };
}

/**
 * Cached `getClient` for the OAuth `clientsStore`: returns the validated client for `clientId`, or `undefined`
 * (logging only the host and reason) when the document is unusable. Successes are cached for 5 minutes (max 100 entries); failures never are.
 */
export async function getCimdClient(
  clientId: string,
  deps: CimdFetchDeps = {}
): Promise<OAuthClientInformationFull | undefined> {
  const now = Date.now();
  const hit = cache.get(clientId);
  if (hit && hit.expiresAt > now) return hit.client;

  try {
    const client = await fetchClientMetadata(clientId, deps);
    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    cache.set(clientId, { client, expiresAt: now + CACHE_TTL_MS });
    return client;
  } catch (error) {
    const host = URL.canParse(clientId) ? new URL(clientId).hostname : "invalid-url";
    const reason = error instanceof CimdError ? error.message : "fetch failed";
    console.warn(`CIMD client rejected: host=${host} reason=${reason}`);
    return undefined;
  }
}
