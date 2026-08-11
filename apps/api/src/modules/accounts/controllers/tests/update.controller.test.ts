import { describe, expect, it, vi } from "vitest";
import { mockRequest, mockResponse } from "../../../../tests/helpers/httpMocks.js";

vi.mock("../../services/update.service.js", () => ({
  archiveAccount: vi.fn(),
  restoreAccount: vi.fn(),
  updateAccount: vi.fn()
}));

const { archiveAccount, restoreAccount, updateAccount } = await import(
  "../../services/update.service.js"
);
const { postArchiveAccount, postRestoreAccount, putAccount } = await import(
  "../update.controller.js"
);

describe("putAccount", () => {
  it("updates the account", async () => {
    vi.mocked(updateAccount).mockResolvedValue({ id: "acc-1" } as never);
    const res = mockResponse();

    await putAccount(
      mockRequest({ params: { id: "acc-1" }, body: { name: "Renamed" } }),
      res
    );

    expect(updateAccount).toHaveBeenCalledWith("user-1", "acc-1", {
      name: "Renamed"
    });
    expect(res.json).toHaveBeenCalledWith({ account: { id: "acc-1" } });
  });
});

describe("postArchiveAccount", () => {
  it("archives the account", async () => {
    vi.mocked(archiveAccount).mockResolvedValue({ id: "acc-1" } as never);
    const res = mockResponse();

    await postArchiveAccount(mockRequest({ params: { id: "acc-1" } }), res);

    expect(archiveAccount).toHaveBeenCalledWith("user-1", "acc-1");
  });
});

describe("postRestoreAccount", () => {
  it("restores the account", async () => {
    vi.mocked(restoreAccount).mockResolvedValue({ id: "acc-1" } as never);
    const res = mockResponse();

    await postRestoreAccount(mockRequest({ params: { id: "acc-1" } }), res);

    expect(restoreAccount).toHaveBeenCalledWith("user-1", "acc-1");
  });
});
