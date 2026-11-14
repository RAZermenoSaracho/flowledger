import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";
import { HttpError } from "../../../../utils/httpError.js";

const ingestNotification = vi.fn();
vi.mock("../../services/ingest.service.js", () => ({ ingestNotification }));

const { postIngest } = await import("../ingest.controller.js");

const req = (header?: string) =>
  mockRequest({ user: { id: "u1" }, params: { id: "m1" }, body: { text: "hi" }, header: () => header } as never);

describe("postIngest", () => {
  it("responds 202 with the ingest result", async () => {
    ingestNotification.mockResolvedValue({ runId: "r1", status: "queued", duplicate: false });
    const res = mockResponse();
    await postIngest(req("k1"), res);
    expect(ingestNotification).toHaveBeenCalledWith("u1", "m1", "hi", "k1");
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith({ runId: "r1", status: "queued", duplicate: false });
  });

  it("sets Retry-After: 60 on a 429", async () => {
    ingestNotification.mockRejectedValue(new HttpError(429, "full"));
    const res = mockResponse();
    res.set = vi.fn().mockReturnThis();
    await expect(postIngest(req(), res)).rejects.toMatchObject({ statusCode: 429 });
    expect(res.set).toHaveBeenCalledWith("Retry-After", "60");
  });

  it("rejects an oversized Idempotency-Key with 400", async () => {
    await expect(postIngest(req("x".repeat(129)), mockResponse())).rejects.toMatchObject({ statusCode: 400 });
  });
});
