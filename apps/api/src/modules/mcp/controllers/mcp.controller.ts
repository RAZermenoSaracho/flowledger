import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Request, Response } from "express";
import type { McpAuth } from "../types/mcp.types.js";
import { registerTools } from "./tools.controller.js";

/** Handles one MCP JSON-RPC POST statelessly: a fresh server and JSON-mode transport per request, closed when the response ends. */
export async function postMcp(req: Request, res: Response) {
  const auth = req.auth as McpAuth | undefined;
  if (!auth) {
    res.status(401).json({ message: "Authentication required" });
    return;
  }

  const server = new McpServer({ name: "flowledger", version: "1.0.0" });
  registerTools(server, auth);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

/** Rejects GET/DELETE on `/mcp` (no SSE stream or sessions) with 405 and `Allow: POST`. */
export function methodNotAllowed(_req: Request, res: Response) {
  res.setHeader("Allow", "POST");
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed." },
    id: null
  });
}
