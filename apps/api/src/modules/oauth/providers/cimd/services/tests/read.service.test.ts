import https from "node:https";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CimdFetchDeps } from "../../types/cimd.types.js";
import { clearCimdCache, fetchClientMetadata, getCimdClient } from "../read.service.js";
import { TEST_CERT, TEST_KEY } from "./tlsFixture.js";

const guard = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("../../utils/ipGuard.js", async (orig) => {
  const real = await orig<typeof import("../../utils/ipGuard.js")>();
  guard.fn.mockImplementation(real.isPublicAddress);
  return { isPublicAddress: (a: string) => guard.fn(a) };
});

const ID = "https://client.test/oauth/client.json";
const doc = { client_id: ID, client_name: "Test App", redirect_uris: ["https://client.test/cb"] };

type Handler = (res: import("node:http").ServerResponse) => void;
let handler: Handler;
let hits = 0;
let server: https.Server;
let deps: CimdFetchDeps;
const lookup = vi.fn();
let realGuard: (a: string) => boolean;

function json(body: unknown, headers: Record<string, string> = { "content-type": "application/json" }): Handler {
  return (res) => {
    res.writeHead(200, headers);
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
}

beforeAll(async () => {
  realGuard = (await vi.importActual<typeof import("../../utils/ipGuard.js")>("../../utils/ipGuard.js")).isPublicAddress;
  server = https.createServer({ cert: TEST_CERT, key: TEST_KEY }, (_req, res) => {
    hits += 1;
    handler(res);
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  deps = {
    port: (server.address() as AddressInfo).port,
    agentOptions: { ca: TEST_CERT },
    lookup
  };
});

afterAll(() => {
  server.close();
});

beforeEach(() => {
  hits = 0;
  clearCimdCache();
  handler = json(doc);
  lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  guard.fn.mockImplementation(realGuard);
});

/** Treats loopback as public and resolves to it, so the pinned connection reaches the local TLS server. */
function reachable() {
  guard.fn.mockReturnValue(true);
  lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
}

describe("fetchClientMetadata", () => {
  it("rejects non-public answers without connecting", async () => {
    for (const address of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      lookup.mockResolvedValue([{ address, family: address.includes(":") ? 6 : 4 }]);
      await expect(fetchClientMetadata(ID, deps)).rejects.toThrow("non-public address");
    }
    expect(hits).toBe(0);
  });

  it("rejects mixed public and private answers and empty answers", async () => {
    lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 }
    ]);
    await expect(fetchClientMetadata(ID, deps)).rejects.toThrow("non-public address");
    lookup.mockResolvedValue([]);
    await expect(fetchClientMetadata(ID, deps)).rejects.toThrow("non-public address");
  });

  it("dials the validated address and ignores a later DNS answer (rebinding)", async () => {
    reachable();
    lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]).mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);

    await expect(fetchClientMetadata(ID, deps)).resolves.toMatchObject({ client_id: ID });
    expect(lookup).toHaveBeenCalledTimes(1);
    expect(hits).toBe(1);
  });

  it("accepts a valid document, tolerates a declared private_key_jwt that also supports none, and rejects bad documents", async () => {
    reachable();
    await expect(fetchClientMetadata(ID, deps)).resolves.toEqual({
      client_id: ID,
      client_name: "Test App",
      redirect_uris: ["https://client.test/cb"],
      token_endpoint_auth_method: "none"
    });

    handler = json({ ...doc, token_endpoint_auth_method: "private_key_jwt", token_endpoint_auth_methods_supported: ["none", "private_key_jwt"] });
    await expect(fetchClientMetadata(ID, deps)).resolves.toMatchObject({ token_endpoint_auth_method: "none" });

    const cases: [Handler, string][] = [
      [(res) => { res.writeHead(301, { location: "https://client.test/x" }); res.end(); }, "status 301"],
      [json(JSON.stringify({ ...doc, pad: "a".repeat(70_000) })), "body too large"],
      [json(doc, { "content-type": "text/html" }), "wrong content type"],
      [json({ ...doc, client_id: "https://client.test/other.json" }), "client_id mismatch"],
      [json({ client_id: ID }), "invalid document"],
      [json({ ...doc, redirect_uris: ["http://evil.example/cb"] }), "invalid document"],
      [json({ ...doc, token_endpoint_auth_method: "client_secret_basic" }), "unsupported token_endpoint_auth_method"],
      [json("nope"), "invalid JSON"]
    ];
    for (const [h, message] of cases) {
      handler = h;
      await expect(fetchClientMetadata(ID, deps)).rejects.toThrow(message);
    }
  });

  it("rejects an unusable client_id URL before resolving", async () => {
    await expect(fetchClientMetadata("http://client.test/c.json", deps)).rejects.toThrow("not https");
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("getCimdClient", () => {
  it("returns undefined and logs host-only on failure, and does not cache failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    lookup.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);

    expect(await getCimdClient(ID, deps)).toBeUndefined();
    expect(await getCimdClient(ID, deps)).toBeUndefined();
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]![0]).toBe("CIMD client rejected: host=client.test reason=non-public address");
  });

  it("caches successes for five minutes", async () => {
    reachable();
    vi.useFakeTimers({ toFake: ["Date"] });

    expect((await getCimdClient(ID, deps))?.client_name).toBe("Test App");
    await getCimdClient(ID, deps);
    expect(hits).toBe(1);

    vi.setSystemTime(Date.now() + 5 * 60 * 1000 + 1);
    await getCimdClient(ID, deps);
    expect(hits).toBe(2);
    vi.useRealTimers();
  });
});
