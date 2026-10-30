import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { HttpError } from "../../../../utils/httpError.js";
import type { McpAuth } from "../../types/mcp.types.js";

vi.mock("../../../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

const { auditLog } = await import("../../../../utils/auditLog.js");
const { runRead, runWrite } = await import("../runTool.js");

const auth = (scopes: string[]) =>
  ({ token: "t", clientId: "k1", scopes, extra: { userId: "u1", kind: "apiKey" } }) as McpAuth;
const done = { data: { x: 1 }, resourceId: "r1", status: 201 };

beforeEach(() => vi.clearAllMocks());

describe("runRead", () => {
  it("returns the data, or an isError result when the action throws", async () => {
    expect((await runRead(async () => ({ a: 1 }))).structuredContent).toEqual({ a: 1 });
    const failed = await runRead(async () => {
      throw new HttpError(404, "nope");
    });
    expect(failed.isError).toBe(true);
  });
});

describe("runWrite", () => {
  it("refuses without write scope, audits 403 and never runs the action", async () => {
    const action = vi.fn();
    const result = await runWrite(auth(["read"]), "mcp.x", "id1", action);
    expect(result.isError).toBe(true);
    expect(action).not.toHaveBeenCalled();
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ op: "mcp.x", resourceId: "id1", status: 403 }));
  });

  it("audits once with the action's resource id and status on success", async () => {
    await runWrite(auth(["write"]), "mcp.x", null, async () => done);
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith({
      userId: "u1",
      credentialKind: "apiKey",
      credentialId: "k1",
      op: "mcp.x",
      resourceId: "r1",
      status: 201
    });
  });

  it.each([
    [new HttpError(404, "nope"), 404],
    [new z.ZodError([]), 400]
  ])("audits the mapped status on failure", async (error, status) => {
    await runWrite(auth(["write"]), "mcp.x", "id1", async () => {
      throw error;
    });
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "id1", status }));
  });
});
