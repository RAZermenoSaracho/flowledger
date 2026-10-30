import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../../../../utils/httpError.js";

vi.mock("../../../groups/services/read.service.js", () => ({ getMemberGroup: vi.fn() }));
vi.mock("../../../shared-expenses/services/create.service.js", () => ({ createSharedExpense: vi.fn() }));
vi.mock("../../../shared-expenses/services/read.service.js", () => ({
  assertOwnedGroupTransaction: vi.fn(),
  listSharedExpenses: vi.fn()
}));

const { getMemberGroup } = await import("../../../groups/services/read.service.js");
const { createSharedExpense } = await import("../../../shared-expenses/services/create.service.js");
const { assertOwnedGroupTransaction, listSharedExpenses } = await import(
  "../../../shared-expenses/services/read.service.js"
);
const { getV1Group, getV1SharedExpenses, postV1SharedExpense } = await import("../v1.groups.controller.js");

const res = () => {
  const r = { json: vi.fn(), status: vi.fn() };
  r.status.mockReturnValue(r);
  return r as unknown as Response & { json: ReturnType<typeof vi.fn>; status: ReturnType<typeof vi.fn> };
};
const req = (extra: object = {}) => ({ user: { id: "u1" }, query: {}, params: {}, body: {}, ...extra }) as unknown as Request;

beforeEach(() => vi.clearAllMocks());

describe("getV1SharedExpenses", () => {
  it("caps at 100 rows and reports the untruncated total", async () => {
    vi.mocked(listSharedExpenses).mockResolvedValue(Array.from({ length: 250 }, (_, i) => ({ id: String(i) })) as never);
    const response = res();

    await getV1SharedExpenses(req(), response);

    expect(listSharedExpenses).toHaveBeenCalledWith("u1", undefined);
    const body = response.json.mock.calls[0]![0];
    expect(body.sharedExpenses).toHaveLength(100);
    expect(body.total).toBe(250);
  });
});

describe("postV1SharedExpense", () => {
  const body = { transactionId: "t1", title: "x" };

  it("checks the group-transaction precondition before creating", async () => {
    vi.mocked(createSharedExpense).mockResolvedValue({ id: "s1" } as never);
    const response = res();

    await postV1SharedExpense(req({ body }), response);

    expect(assertOwnedGroupTransaction).toHaveBeenCalledWith("u1", "t1");
    expect(createSharedExpense).toHaveBeenCalledWith("u1", body);
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it("creates nothing when the precondition fails", async () => {
    vi.mocked(assertOwnedGroupTransaction).mockRejectedValue(new HttpError(400, "no group"));

    await expect(postV1SharedExpense(req({ body }), res())).rejects.toThrow("no group");
    expect(createSharedExpense).not.toHaveBeenCalled();
  });
});

describe("getV1Group", () => {
  it("returns the group for the caller only", async () => {
    vi.mocked(getMemberGroup).mockResolvedValue({ id: "g1" } as never);
    const response = res();

    await getV1Group(req({ params: { id: "g1" } }), response);

    expect(getMemberGroup).toHaveBeenCalledWith("u1", "g1");
    expect(response.json).toHaveBeenCalledWith({ group: { id: "g1" } });
  });
});
