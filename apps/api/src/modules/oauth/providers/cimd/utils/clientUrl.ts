import { isIP } from "node:net";
import { CimdError } from "../types/cimd.types.js";
import { isPublicAddress } from "./ipGuard.js";

/**
 * Validates that `clientId` is an acceptable Client ID Metadata Document URL (https, path present,
 * default port, no credentials/fragment, not a non-public IP literal) and returns the parsed URL.
 * Throws {@link CimdError} otherwise.
 */
export function parseClientIdUrl(clientId: string): URL {
  if (!URL.canParse(clientId)) throw new CimdError("not a URL");
  const url = new URL(clientId);

  if (url.protocol !== "https:") throw new CimdError("not https");
  if (url.username || url.password) throw new CimdError("has credentials");
  if (url.hash || clientId.includes("#")) throw new CimdError("has fragment");
  if (url.port !== "") throw new CimdError("non-default port");
  if (url.pathname === "/" || url.pathname === "") throw new CimdError("no path");

  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) && !isPublicAddress(bare)) throw new CimdError("non-public IP literal");

  return url;
}
