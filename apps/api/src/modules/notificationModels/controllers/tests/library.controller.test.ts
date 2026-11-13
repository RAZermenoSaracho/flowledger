import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/library.service.js", () => ({
  publishModel: vi.fn(), updateFromSource: vi.fn(), listLibrary: vi.fn(), getLibraryModel: vi.fn(), installModel: vi.fn()
}));

const service = await import("../../services/library.service.js");
const controller = await import("../library.controller.js");

describe("library controller", () => {
  it("publishes, updates, lists, reads and installs for the caller", async () => {
    vi.mocked(service.publishModel).mockResolvedValue({ model: { id: "m" } } as never);
    let res = mockResponse();
    await controller.postPublish(mockRequest({ params: { id: "m" } }), res);
    expect(service.publishModel).toHaveBeenCalledWith("user-1", "m");
    expect(res.json).toHaveBeenCalledWith({ model: { id: "m" } });

    vi.mocked(service.updateFromSource).mockResolvedValue({ id: "m" } as never);
    res = mockResponse();
    await controller.postUpdateFromSource(mockRequest({ params: { id: "m" }, body: { versionId: "v" } }), res);
    expect(service.updateFromSource).toHaveBeenCalledWith("user-1", "m", { versionId: "v" });
    expect(res.json).toHaveBeenCalledWith({ model: { id: "m" } });

    vi.mocked(service.listLibrary).mockResolvedValue([] as never);
    res = mockResponse();
    await controller.getLibrary(mockRequest(), res);
    expect(res.json).toHaveBeenCalledWith({ data: [] });

    vi.mocked(service.getLibraryModel).mockResolvedValue({ modelId: "m" } as never);
    res = mockResponse();
    await controller.getLibraryEntry(mockRequest({ params: { modelId: "m" } }), res);
    expect(res.json).toHaveBeenCalledWith({ entry: { modelId: "m" } });

    vi.mocked(service.installModel).mockResolvedValue({ id: "c" } as never);
    res = mockResponse();
    await controller.postInstall(mockRequest({ params: { modelId: "m" } }), res);
    expect(service.installModel).toHaveBeenCalledWith("user-1", "m");
    expect(res.status).toHaveBeenCalledWith(201);
  });
});
