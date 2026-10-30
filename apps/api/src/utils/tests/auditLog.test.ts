import { afterEach, describe, expect, it, vi } from "vitest";
import { auditLog } from "../auditLog.js";

describe("auditLog", () => {
  afterEach(() => vi.restoreAllMocks());

  it("writes exactly one JSON line with only the audit fields", () => {
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    auditLog({
      userId: "u1",
      credentialKind: "apiKey",
      credentialId: "k1",
      op: "transactions.create",
      resourceId: "t1",
      status: 201,
      // extra fields must never reach the output
      body: { secret: "fl_leak" }
    } as never);

    expect(write).toHaveBeenCalledTimes(1);
    const line = write.mock.calls[0]![0] as string;
    expect(line.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(line);
    expect(Object.keys(parsed).sort()).toEqual(
      ["audit", "credentialId", "credentialKind", "op", "resourceId", "status", "ts", "userId"].sort()
    );
    expect(parsed.audit).toBe(true);
    expect(line).not.toContain("fl_leak");
  });
});
