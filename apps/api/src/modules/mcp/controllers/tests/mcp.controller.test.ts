import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

const handleRequest = vi.fn();
const transportClose = vi.fn();
const serverClose = vi.fn();
const connect = vi.fn();
const transportOptions: unknown[] = [];

vi.mock("@modelcontextprotocol/sdk/server/mcp.js", () => ({
  McpServer: class {
    connect = connect;
    close = serverClose;
  }
}));
vi.mock("@modelcontextprotocol/sdk/server/streamableHttp.js", () => ({
  StreamableHTTPServerTransport: class {
    constructor(options: unknown) {
      transportOptions.push(options);
    }
    handleRequest = handleRequest;
    close = transportClose;
  }
}));
vi.mock("../tools.controller.js", () => ({ registerTools: vi.fn() }));

const { registerTools } = await import("../tools.controller.js");
const { postMcp, methodNotAllowed } = await import("../mcp.controller.js");

describe("postMcp", () => {
  it("responds 401 without req.auth", async () => {
    const res = mockResponse();
    await postMcp(mockRequest(), res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it("serves one stateless JSON request with a per-request server and cleans up on close", async () => {
    const auth = { scopes: ["read"], extra: { userId: "u1" } };
    const res = mockResponse();
    const on = vi.fn();
    (res as unknown as { on: typeof on }).on = on;
    const req = mockRequest({ auth, body: { a: 1 } } as never);

    await postMcp(req, res);

    expect(registerTools).toHaveBeenCalledWith(expect.anything(), auth);
    expect(transportOptions[0]).toEqual({ sessionIdGenerator: undefined, enableJsonResponse: true });
    expect(connect).toHaveBeenCalled();
    expect(handleRequest).toHaveBeenCalledWith(req, res, { a: 1 });

    on.mock.calls.find(([event]) => event === "close")![1]();
    expect(transportClose).toHaveBeenCalled();
    expect(serverClose).toHaveBeenCalled();
  });
});

describe("methodNotAllowed", () => {
  it("returns 405 with Allow: POST", () => {
    const res = mockResponse();
    methodNotAllowed(mockRequest(), res);
    expect(res.setHeader).toHaveBeenCalledWith("Allow", "POST");
    expect(res.status).toHaveBeenCalledWith(405);
  });
});
