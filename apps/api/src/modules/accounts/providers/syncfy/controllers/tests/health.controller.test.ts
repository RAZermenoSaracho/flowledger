import { describe, expect, it } from "vitest";
import { mockRequest, mockResponse } from "../../../../../../tests/helpers/httpMocks.js";
import {
  getDeprecatedWebhook,
  getSyncfyHealth,
  postDeprecatedWebhook
} from "../health.controller.js";

describe("getSyncfyHealth", () => {
  it("responds with a success payload identifying the syncfy service", async () => {
    const res = mockResponse();
    await getSyncfyHealth(mockRequest(), res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, service: "syncfy" })
    );
  });
});

describe("postDeprecatedWebhook", () => {
  it("responds 410 pointing at the replacement route", async () => {
    const res = mockResponse();
    await postDeprecatedWebhook(mockRequest(), res);

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, deprecated: true })
    );
  });
});

describe("getDeprecatedWebhook", () => {
  it("responds 410 pointing at the replacement route", async () => {
    const res = mockResponse();
    await getDeprecatedWebhook(mockRequest(), res);

    expect(res.status).toHaveBeenCalledWith(410);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, deprecated: true })
    );
  });
});
