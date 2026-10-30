import { EventEmitter } from "node:events";
import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../utils/auditLog.js", () => ({ auditLog: vi.fn() }));

import { auditLog } from "../../../../utils/auditLog.js";
import { auditV1Write } from "../v1Audit.js";

const credential = { userId: "u1", kind: "apiKey", credentialId: "k1", scopes: ["write"], email: "a@b.c" };

function setup(req: Partial<Request>) {
  const res = Object.assign(new EventEmitter(), { statusCode: 201, json: vi.fn() }) as unknown as Response & EventEmitter;
  const next = vi.fn();
  auditV1Write("transaction.create")(req as Request, res, next);
  return { res, next };
}

describe("auditV1Write", () => {
  beforeEach(() => vi.mocked(auditLog).mockClear());

  it("logs once on finish with the created id from the response body and no body content", () => {
    const { res, next } = setup({ credential, params: {}, body: { description: "secret" } } as never);
    res.json({ transaction: { id: "t9" } });
    res.emit("finish");

    expect(next).toHaveBeenCalledWith();
    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(auditLog).toHaveBeenCalledWith({
      userId: "u1",
      credentialKind: "apiKey",
      credentialId: "k1",
      op: "transaction.create",
      resourceId: "t9",
      status: 201
    });
  });

  it("prefers the id from params", () => {
    const { res } = setup({ credential, params: { id: "t1" } } as never);
    res.statusCode = 404;
    res.emit("finish");
    expect(auditLog).toHaveBeenCalledWith(expect.objectContaining({ resourceId: "t1", status: 404 }));
  });

  it("does not log without a credential", () => {
    const { res } = setup({ params: {} } as never);
    res.emit("finish");
    expect(auditLog).not.toHaveBeenCalled();
  });
});
