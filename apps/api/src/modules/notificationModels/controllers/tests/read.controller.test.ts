import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/read.service.js", () => ({
  getModelById: vi.fn(),
  listLogs: vi.fn(),
  listModels: vi.fn(),
  listQueue: vi.fn()
}));

const { getModelById, listLogs, listModels, listQueue } = await import("../../services/read.service.js");
const { getModel, getModelLogs, getModelQueue, getModels } = await import("../read.controller.js");

describe("read controllers", () => {
  it("getModels lists with the raw query", async () => {
    vi.mocked(listModels).mockResolvedValue({ data: [{ id: "m1" }], meta: { total: 1 } } as never);
    const res = mockResponse();
    await getModels(mockRequest({ query: { query: "{}" } }), res);
    expect(listModels).toHaveBeenCalledWith("user-1", "{}");
    expect(res.json).toHaveBeenCalledWith({ data: [{ id: "m1" }], meta: { total: 1 } });
  });

  it("getModel reads by id", async () => {
    vi.mocked(getModelById).mockResolvedValue({ id: "m1" } as never);
    const res = mockResponse();
    await getModel(mockRequest({ params: { id: "m1" } }), res);
    expect(getModelById).toHaveBeenCalledWith("user-1", "m1");
    expect(res.json).toHaveBeenCalledWith({ model: { id: "m1" } });
  });

  it("getModelQueue and getModelLogs list a model's runs", async () => {
    vi.mocked(listQueue).mockResolvedValue({ data: [], meta: {} } as never);
    vi.mocked(listLogs).mockResolvedValue({ data: [], meta: {} } as never);
    const res = mockResponse();
    await getModelQueue(mockRequest({ params: { id: "m1" } }), res);
    await getModelLogs(mockRequest({ params: { id: "m1" } }), res);
    expect(listQueue).toHaveBeenCalledWith("user-1", "m1", undefined);
    expect(listLogs).toHaveBeenCalledWith("user-1", "m1", undefined);
  });
});
