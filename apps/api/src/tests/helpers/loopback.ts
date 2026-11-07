import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

/**
 * Returns the `http://host:port` origin that reaches exactly the socket `server` bound
 * (`listen(0)` must already have been called).
 *
 * `listen(0)` binds the wildcard address, and on macOS an unrelated process listening on exactly
 * `127.0.0.1:<port>` takes precedence over a wildcard listener there, so connecting to `127.0.0.1` can reach
 * the wrong process. The IPv6 loopback has no such shadow when the wildcard is dual-stack.
 * Where the wildcard is IPv4-only, `127.0.0.1` is the only option left.
 */
export function loopbackOrigin(server: Server): string {
  const { family, port } = server.address() as AddressInfo;
  return `http://${family === "IPv6" ? "[::1]" : "127.0.0.1"}:${port}`;
}
