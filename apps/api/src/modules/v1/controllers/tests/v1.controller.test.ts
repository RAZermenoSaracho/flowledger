import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../debts/services/read.service.js", () => ({ listDebts: vi.fn() }));
vi.mock("../../../transactions/services/read.service.js", () => ({ listImportedTransactions: vi.fn() }));

const { listDebts } = await import("../../../debts/services/read.service.js");
const { listImportedTransactions } = await import("../../../transactions/services/read.service.js");
const { getV1Debts, getV1ImportedTransactions } = await import("../v1.controller.js");

const res = () => ({ json: vi.fn() }) as unknown as Response & { json: ReturnType<typeof vi.fn> };
const req = (query: object = {}) => ({ user: { id: "u1" }, query }) as unknown as Request;

beforeEach(() => vi.clearAllMocks());

describe("getV1Debts", () => {
  it("returns the caller's debts capped at 100 per list with totals", async () => {
    vi.mocked(listDebts).mockResolvedValue({
      iOwe: Array.from({ length: 150 }, (_, i) => ({ i })),
      owedToMe: []
    } as never);
    const response = res();

    await getV1Debts(req(), response);

    expect(listDebts).toHaveBeenCalledWith("u1");
    const body = response.json.mock.calls[0]![0];
    expect(body.iOwe).toHaveLength(100);
    expect(body.totals).toEqual({ iOwe: 150, owedToMe: 0 });
  });
});

describe("getV1ImportedTransactions", () => {
  it("caps the rows at 100 and keeps the untruncated total", async () => {
    vi.mocked(listImportedTransactions).mockResolvedValue({
      importedTransactions: Array.from({ length: 250 }, (_, i) => ({ id: String(i) })),
      total: 250,
      pendingCount: 7
    } as never);
    const response = res();

    await getV1ImportedTransactions(req({ query: '{"x":1}' }), response);

    expect(listImportedTransactions).toHaveBeenCalledWith("u1", '{"x":1}');
    const body = response.json.mock.calls[0]![0];
    expect(body.importedTransactions).toHaveLength(100);
    expect(body).toMatchObject({ total: 250, pendingCount: 7 });
  });
});
